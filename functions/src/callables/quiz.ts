import { FieldValue } from "firebase-admin/firestore";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { db, loadConfig, requireString, requireUid } from "../lib/admin.js";
import { applyOutcome, readUserContext } from "../lib/engine.js";
import { scoreQuiz } from "../lib/quiz.js";
import { emptyTopicProgress, mergeTopicProgress } from "../lib/progress.js";
import type { QuestionKeyDoc, QuizDoc, TopicDoc, TopicProgressDoc } from "../types.js";

interface FinalizeQuizInput {
  attemptId?: unknown;
  quizId?: unknown;
  answers?: unknown;
}

function parseAnswers(raw: unknown): Record<string, number> {
  if (typeof raw !== "object" || raw === null) throw new HttpsError("invalid-argument", "Invalid answers.");
  const answers: Record<string, number> = {};
  for (const [questionId, choice] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof choice !== "number" || !Number.isInteger(choice) || choice < 0 || choice > 5) continue;
    answers[questionId] = choice;
  }
  return answers;
}

/**
 * Score a quiz exactly once per attemptId. The client never sees answer keys before this call.
 * XP and Stars are granted only for the first completed attempt of a quiz; later attempts
 * still update accuracy and streak activity.
 */
export const finalizeQuiz = onCall(async (request) => {
  const uid = requireUid(request);
  const data = (request.data ?? {}) as FinalizeQuizInput;
  const attemptId = requireString(data.attemptId, "attemptId", 80);
  const quizId = requireString(data.quizId, "quizId", 120);
  const answers = parseAnswers(data.answers);
  const config = await loadConfig();
  const eventId = `quiz_${uid}_${attemptId}`;

  return db.runTransaction(async (txn) => {
    const ctx = await readUserContext(txn, uid, eventId, config);
    const attemptRef = db.doc(`quizAttempts/${attemptId}`);
    const quizRef = db.doc(`quizzes/${quizId}`);
    const completionRef = db.doc(`quizCompletions/${uid}_${quizId}`);
    const [attemptSnap, quizSnap, completionSnap] = await txn.getAll(attemptRef, quizRef, completionRef);
    if (attemptSnap.exists) {
      if (attemptSnap.get("userId") !== uid) throw new HttpsError("permission-denied", "Not your attempt.");
      return { alreadyFinalized: true, ...attemptSnap.data() };
    }
    if (!quizSnap.exists) throw new HttpsError("not-found", "Quiz not found.");
    const quiz = quizSnap.data() as QuizDoc;
    const topicRef = db.doc(`topics/${quiz.topicId}`);
    const progressRef = db.doc(`studentProgress/${uid}/topics/${quiz.topicId}`);
    const keyRefs = quiz.questionIds.map((questionId) => db.doc(`questionKeys/${questionId}`));
    const [topicSnap, progressSnap, ...keySnaps] = await txn.getAll(topicRef, progressRef, ...keyRefs);
    const keys = new Map<string, QuestionKeyDoc>();
    keySnaps.forEach((snap) => {
      if (snap.exists) keys.set(snap.id, snap.data() as QuestionKeyDoc);
    });
    const scored = scoreQuiz(quiz.questionIds, answers, keys);
    const firstCompletion = !completionSnap.exists;
    const topic = topicSnap.data() as TopicDoc | undefined;
    const prevProgress = progressSnap.exists
      ? (progressSnap.data() as TopicProgressDoc)
      : emptyTopicProgress(quiz.topicId, topic?.chapterId ?? "", quiz.subjectId, quiz.classLevel);
    const nextProgress = mergeTopicProgress(
      prevProgress,
      { level: quiz.level, attempts: scored.total, correct: scored.score },
      config.unlockThresholds
    );

    txn.set(attemptRef, {
      id: attemptId,
      userId: uid,
      quizId,
      answers,
      finalized: true,
      score: scored.score,
      total: scored.total,
      results: scored.results,
      createdAt: FieldValue.serverTimestamp(),
      finalizedAt: FieldValue.serverTimestamp()
    });
    txn.set(progressRef, { ...nextProgress, lastPracticedAt: FieldValue.serverTimestamp() });
    if (firstCompletion) {
      txn.set(completionRef, { userId: uid, quizId, attemptId, score: scored.score, total: scored.total, createdAt: FieldValue.serverTimestamp() });
    }
    const result = applyOutcome(txn, ctx, {
      eventId,
      reason: "quiz_completed",
      refId: quizId,
      xp: firstCompletion ? scored.total * config.quizXpPerQuestion : 0,
      stars: firstCompletion ? scored.score * config.quizStarsPerCorrect : 0,
      activity: { questions: scored.total },
      stats: { questionsSolved: scored.score }
    });
    return {
      alreadyFinalized: false,
      firstCompletion,
      score: scored.score,
      total: scored.total,
      results: scored.results,
      levelUnlocked: nextProgress.levelUnlocked,
      rewards: result
    };
  });
});
