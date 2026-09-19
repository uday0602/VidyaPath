import { FieldValue } from "firebase-admin/firestore";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { db, loadConfig, requireString, requireUid } from "../lib/admin.js";
import { addNotification, toMillis } from "../lib/engine.js";
import { contentHash } from "../lib/hash.js";
import type { DoubtDoc, PublicProfile } from "../types.js";

const SUBJECTS = new Set(["mathematics", "physics", "chemistry", "biology", "science", "social_science", "english"]);

async function loadAuthor(uid: string): Promise<PublicProfile> {
  const snap = await db.doc(`publicProfiles/${uid}`).get();
  if (!snap.exists) throw new HttpsError("failed-precondition", "Profile not ready yet. Try again in a moment.");
  return snap.data() as PublicProfile;
}

function assertCooldown(lastAt: unknown, cooldownSec: number, what: string): void {
  const lastMs = toMillis(lastAt);
  if (lastMs !== null && Date.now() - lastMs < cooldownSec * 1000) {
    const wait = Math.ceil((cooldownSec * 1000 - (Date.now() - lastMs)) / 1000);
    throw new HttpsError("resource-exhausted", `Please wait ${wait}s before posting another ${what}.`);
  }
}

async function assertNotBlocked(blockerUid: string, uid: string): Promise<void> {
  const snap = await db.doc(`blocks/${blockerUid}/users/${uid}`).get();
  if (snap.exists) throw new HttpsError("permission-denied", "You cannot interact with this student.");
}

/** Post a doubt with cooldown and duplicate detection. Author identity is the anonymous username only. */
export const postDoubt = onCall(async (request) => {
  const uid = requireUid(request);
  const data = (request.data ?? {}) as Record<string, unknown>;
  const subjectId = requireString(data.subjectId, "subjectId", 40);
  if (!SUBJECTS.has(subjectId)) throw new HttpsError("invalid-argument", "Unknown subject.");
  const title = requireString(data.title, "title", 140);
  const body = requireString(data.body, "body", 2000);
  const chapterId = typeof data.chapterId === "string" && data.chapterId ? data.chapterId.slice(0, 120) : null;
  const topicId = typeof data.topicId === "string" && data.topicId ? data.topicId.slice(0, 120) : null;
  const config = await loadConfig();
  const [author, userSnap] = await Promise.all([loadAuthor(uid), db.doc(`users/${uid}`).get()]);
  assertCooldown(userSnap.get("lastDoubtAt"), config.doubtCooldownSec, "doubt");
  const hash = contentHash(`${title} ${body}`);
  const duplicate = await db.collection("doubts").where("authorId", "==", uid).where("contentHash", "==", hash).limit(1).get();
  if (!duplicate.empty) throw new HttpsError("already-exists", "You already posted this doubt.");

  const ref = db.collection("doubts").doc();
  const doubt: Omit<DoubtDoc, "createdAt"> & { createdAt: FieldValue } = {
    id: ref.id,
    authorId: uid,
    authorName: author.anonUsername,
    subjectId: subjectId as DoubtDoc["subjectId"],
    chapterId,
    topicId,
    title,
    body,
    status: "open",
    hidden: false,
    answerCount: 0,
    voteCount: 0,
    contentHash: hash,
    createdAt: FieldValue.serverTimestamp()
  };
  const batch = db.batch();
  batch.set(ref, doubt);
  batch.update(db.doc(`users/${uid}`), { lastDoubtAt: FieldValue.serverTimestamp() });
  await batch.commit();
  return { doubtId: ref.id };
});

export const postAnswer = onCall(async (request) => {
  const uid = requireUid(request);
  const data = (request.data ?? {}) as Record<string, unknown>;
  const doubtId = requireString(data.doubtId, "doubtId", 80);
  const body = requireString(data.body, "body", 2000);
  const config = await loadConfig();
  const [author, userSnap, doubtSnap] = await Promise.all([loadAuthor(uid), db.doc(`users/${uid}`).get(), db.doc(`doubts/${doubtId}`).get()]);
  if (!doubtSnap.exists || doubtSnap.get("hidden") === true) throw new HttpsError("not-found", "Doubt not found.");
  const doubt = doubtSnap.data() as DoubtDoc;
  assertCooldown(userSnap.get("lastAnswerAt"), config.answerCooldownSec, "answer");
  await assertNotBlocked(doubt.authorId, uid);
  const hash = contentHash(body);
  const duplicate = await db.collection(`doubts/${doubtId}/answers`).where("authorId", "==", uid).where("contentHash", "==", hash).limit(1).get();
  if (!duplicate.empty) throw new HttpsError("already-exists", "You already posted this answer.");

  const ref = db.collection(`doubts/${doubtId}/answers`).doc();
  await db.runTransaction(async (txn) => {
    txn.set(ref, {
      id: ref.id,
      doubtId,
      authorId: uid,
      authorName: author.anonUsername,
      body,
      voteCount: 0,
      hidden: false,
      contentHash: hash,
      createdAt: FieldValue.serverTimestamp()
    });
    txn.update(doubtSnap.ref, { answerCount: FieldValue.increment(1), status: doubt.status === "open" ? "answered" : doubt.status });
    txn.update(db.doc(`users/${uid}`), { lastAnswerAt: FieldValue.serverTimestamp() });
    if (doubt.authorId !== uid) {
      addNotification(txn, doubt.authorId, "doubt", "New answer to your doubt", `${author.anonUsername} answered "${doubt.title}".`, `/doubts/${doubtId}`);
    }
  });
  return { answerId: ref.id };
});

/** One vote per user per answer, enforced by a vote document whose id is uid_answerId. */
export const voteAnswer = onCall(async (request) => {
  const uid = requireUid(request);
  const data = (request.data ?? {}) as Record<string, unknown>;
  const doubtId = requireString(data.doubtId, "doubtId", 80);
  const answerId = requireString(data.answerId, "answerId", 80);
  const voteRef = db.doc(`votes/${uid}_${answerId}`);
  const answerRef = db.doc(`doubts/${doubtId}/answers/${answerId}`);
  const doubtRef = db.doc(`doubts/${doubtId}`);

  return db.runTransaction(async (txn) => {
    const [voteSnap, answerSnap] = await txn.getAll(voteRef, answerRef);
    if (voteSnap.exists) throw new HttpsError("already-exists", "You already upvoted this answer.");
    if (!answerSnap.exists || answerSnap.get("hidden") === true) throw new HttpsError("not-found", "Answer not found.");
    if (answerSnap.get("authorId") === uid) throw new HttpsError("failed-precondition", "You cannot upvote your own answer.");
    txn.set(voteRef, { id: voteRef.id, userId: uid, doubtId, answerId, createdAt: FieldValue.serverTimestamp() });
    txn.update(answerRef, { voteCount: FieldValue.increment(1) });
    txn.update(doubtRef, { voteCount: FieldValue.increment(1) });
    return { voteCount: ((answerSnap.get("voteCount") as number) ?? 0) + 1 };
  });
});
