import { FieldValue } from "firebase-admin/firestore";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { db, requireString, requireUid } from "../lib/admin.js";
import { addNotification } from "../lib/engine.js";
import { scoreQuiz } from "../lib/quiz.js";
import type { PublicProfile, QuestionKeyDoc, TwinChallengeDoc } from "../types.js";

/**
 * Prototype peer matching: same class, same goal, closest learning level.
 * Only anonymous public profile fields are ever exchanged. No private chat.
 */
export const matchStudyTwin = onCall(async (request) => {
  const uid = requireUid(request);
  const myRef = db.doc(`publicProfiles/${uid}`);
  const mySnap = await myRef.get();
  if (!mySnap.exists) throw new HttpsError("failed-precondition", "Profile not ready yet.");
  const me = mySnap.data() as PublicProfile;
  if (me.twinPairId) return { status: "matched", pairId: me.twinPairId };

  const candidates = await db
    .collection("publicProfiles")
    .where("classLevel", "==", me.classLevel)
    .where("goal", "==", me.goal)
    .where("twinStatus", "==", "searching")
    .limit(10)
    .get();
  const ranked = candidates.docs
    .filter((doc) => doc.id !== uid)
    .sort((left, right) => Math.abs((left.get("level") as number) - me.level) - Math.abs((right.get("level") as number) - me.level));
  const partner = ranked[0];
  if (!partner) {
    await myRef.update({ twinStatus: "searching", updatedAt: FieldValue.serverTimestamp() });
    return { status: "searching", pairId: null };
  }

  const pairRef = db.collection("studyTwins").doc();
  return db.runTransaction(async (txn) => {
    const [freshMe, freshPartner] = await txn.getAll(myRef, partner.ref);
    if (freshMe.get("twinPairId")) return { status: "matched", pairId: freshMe.get("twinPairId") as string };
    if (freshPartner.get("twinStatus") !== "searching") throw new HttpsError("aborted", "Partner was just matched. Try again.");
    txn.set(pairRef, { id: pairRef.id, members: [uid, partner.id], classLevel: me.classLevel, goal: me.goal, status: "active", createdAt: FieldValue.serverTimestamp() });
    txn.update(myRef, { twinStatus: "matched", twinPairId: pairRef.id, updatedAt: FieldValue.serverTimestamp() });
    txn.update(partner.ref, { twinStatus: "matched", twinPairId: pairRef.id, updatedAt: FieldValue.serverTimestamp() });
    addNotification(txn, partner.id, "twin", "Study Twin matched", `${me.anonUsername} is your new Study Twin.`, "/study-twin");
    return { status: "matched", pairId: pairRef.id };
  });
});

export const createTwinChallenge = onCall(async (request) => {
  const uid = requireUid(request);
  const pairId = requireString((request.data as { pairId?: unknown })?.pairId, "pairId", 80);
  const pairSnap = await db.doc(`studyTwins/${pairId}`).get();
  if (!pairSnap.exists || !(pairSnap.get("members") as string[]).includes(uid)) throw new HttpsError("permission-denied", "Not your pair.");
  const members = pairSnap.get("members") as string[];
  const questions = await db.collection("questions").where("classLevel", "==", pairSnap.get("classLevel")).limit(30).get();
  if (questions.size < 5) throw new HttpsError("failed-precondition", "Not enough questions for this class yet.");
  const seed = Array.from(pairId).reduce((sum, char) => sum + char.charCodeAt(0), 0);
  const questionIds = questions.docs.map((doc) => doc.id).sort().filter((_, index) => (index + seed) % Math.ceil(questions.size / 5) === 0).slice(0, 5);
  const ref = db.collection("twinChallenges").doc();
  await ref.set({ id: ref.id, pairId, members, questionIds, results: {}, createdAt: FieldValue.serverTimestamp() });
  const partnerId = members.find((member) => member !== uid);
  if (partnerId) {
    await db.runTransaction(async (txn) => addNotification(txn, partnerId, "twin", "Study Twin challenge", "Your twin started a 5-question challenge.", "/study-twin"));
  }
  return { challengeId: ref.id, questionIds };
});

export const submitTwinChallenge = onCall(async (request) => {
  const uid = requireUid(request);
  const data = (request.data ?? {}) as { challengeId?: unknown; answers?: unknown };
  const challengeId = requireString(data.challengeId, "challengeId", 80);
  const answers: Record<string, number> = {};
  for (const [questionId, choice] of Object.entries((data.answers as Record<string, unknown>) ?? {})) {
    if (typeof choice === "number" && Number.isInteger(choice)) answers[questionId] = choice;
  }
  const ref = db.doc(`twinChallenges/${challengeId}`);
  return db.runTransaction(async (txn) => {
    const snap = await txn.get(ref);
    if (!snap.exists) throw new HttpsError("not-found", "Challenge not found.");
    const challenge = snap.data() as TwinChallengeDoc;
    if (!challenge.members.includes(uid)) throw new HttpsError("permission-denied", "Not your challenge.");
    if (challenge.results[uid]) return { alreadySubmitted: true, ...challenge.results[uid] };
    const keySnaps = await txn.getAll(...challenge.questionIds.map((questionId) => db.doc(`questionKeys/${questionId}`)));
    const keys = new Map<string, QuestionKeyDoc>();
    keySnaps.forEach((keySnap) => {
      if (keySnap.exists) keys.set(keySnap.id, keySnap.data() as QuestionKeyDoc);
    });
    const scored = scoreQuiz(challenge.questionIds, answers, keys);
    txn.update(ref, { [`results.${uid}`]: { score: scored.score, total: scored.total, completedAt: FieldValue.serverTimestamp() } });
    return { alreadySubmitted: false, score: scored.score, total: scored.total, results: scored.results };
  });
});
