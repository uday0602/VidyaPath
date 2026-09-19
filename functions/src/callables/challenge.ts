import { FieldValue } from "firebase-admin/firestore";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { db, loadConfig, requireString, requireUid } from "../lib/admin.js";
import { applyOutcome, readUserContext } from "../lib/engine.js";
import { scoreQuiz } from "../lib/quiz.js";
import { daysBetween, istDate } from "../lib/time.js";
import type { DailyChallengeDoc, QuestionKeyDoc } from "../types.js";

const EPOCH = "2026-01-01";

/** Today's challenge is picked deterministically from the seeded pool by date. The client uses the same rule. */
export function pickChallengeIndex(today: string, poolSize: number): number {
  return poolSize === 0 ? 0 : ((daysBetween(EPOCH, today) % poolSize) + poolSize) % poolSize;
}

export const completeDailyChallenge = onCall(async (request) => {
  const uid = requireUid(request);
  const data = (request.data ?? {}) as { challengeId?: unknown; answers?: unknown };
  const challengeId = requireString(data.challengeId, "challengeId", 120);
  const rawAnswers = (typeof data.answers === "object" && data.answers) || {};
  const answers: Record<string, number> = {};
  for (const [questionId, choice] of Object.entries(rawAnswers as Record<string, unknown>)) {
    if (typeof choice === "number" && Number.isInteger(choice)) answers[questionId] = choice;
  }
  const config = await loadConfig();
  const pool = await db.collection("dailyChallenges").orderBy("order").get();
  const challenges = pool.docs.map((doc) => doc.data() as DailyChallengeDoc);

  const now = new Date();
  const eventId = `challenge_${uid}_${istDate(now)}`;

  return db.runTransaction(async (txn) => {
    const ctx = await readUserContext(txn, uid, eventId, config, now);
    const completionRef = db.doc(`challengeCompletions/${uid}_${ctx.today}`);
    const todays = challenges[pickChallengeIndex(ctx.today, challenges.length)];
    if (!todays || todays.id !== challengeId) throw new HttpsError("failed-precondition", "That is not today's challenge.");
    const keyRefs = todays.questionIds.map((questionId) => db.doc(`questionKeys/${questionId}`));
    const [completionSnap, ...keySnaps] = await txn.getAll(completionRef, ...keyRefs);
    if (ctx.eventDone || completionSnap.exists) {
      return { alreadyCompleted: true, ...(completionSnap.data() ?? {}) };
    }
    const keys = new Map<string, QuestionKeyDoc>();
    keySnaps.forEach((snap) => {
      if (snap.exists) keys.set(snap.id, snap.data() as QuestionKeyDoc);
    });
    const scored = scoreQuiz(todays.questionIds, answers, keys);
    txn.set(completionRef, {
      id: `${uid}_${ctx.today}`,
      userId: uid,
      challengeId,
      date: ctx.today,
      score: scored.score,
      total: scored.total,
      results: scored.results,
      createdAt: FieldValue.serverTimestamp()
    });
    const rewards = applyOutcome(txn, ctx, {
      eventId,
      reason: "daily_challenge",
      refId: challengeId,
      xp: config.challengeXp,
      stars: config.challengeStars,
      activity: { questions: scored.total },
      stats: { questionsSolved: scored.score }
    });
    return { alreadyCompleted: false, score: scored.score, total: scored.total, results: scored.results, rewards };
  });
});
