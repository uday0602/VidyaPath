import { FieldValue } from "firebase-admin/firestore";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { db, loadConfig, requireNumber, requireString, requireUid } from "../lib/admin.js";
import { applyOutcome, readUserContext } from "../lib/engine.js";
import { classifyMistake, isCorrectAnswer } from "../lib/mistakes.js";
import { emptyTopicProgress, mergeTopicProgress } from "../lib/progress.js";
import type { ProblemDoc, ProblemSolutionDoc, TopicProgressDoc } from "../types.js";

interface SubmitInput {
  attemptId?: unknown;
  problemId?: unknown;
  finalAnswer?: unknown;
  steps?: unknown;
  timeSpentSec?: unknown;
}

function parseSteps(raw: unknown): Record<string, string> {
  if (typeof raw !== "object" || raw === null) return {};
  const steps: Record<string, string> = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof value === "string" && key.length <= 40) steps[key] = value.slice(0, 1000);
  }
  return steps;
}

function publicSolution(solution: ProblemSolutionDoc) {
  return { finalAnswer: solution.finalAnswer, steps: solution.steps, commonMistakes: solution.commonMistakes.map((mistake) => ({ type: mistake.type, description: mistake.description })) };
}

/**
 * Check an answer against the server-only solution, classify a wrong answer,
 * update topic progress and adaptive state, and reward the first correct solve.
 * Idempotent on attemptId so a retry never double-rewards.
 */
export const submitProblemAttempt = onCall(async (request) => {
  const uid = requireUid(request);
  const data = (request.data ?? {}) as SubmitInput;
  const attemptId = requireString(data.attemptId, "attemptId", 80);
  const problemId = requireString(data.problemId, "problemId", 120);
  const finalAnswer = requireString(data.finalAnswer, "finalAnswer", 200);
  const steps = parseSteps(data.steps);
  const timeSpentSec = requireNumber(data.timeSpentSec ?? 0, "timeSpentSec", 0, 24 * 3600);
  const config = await loadConfig();
  const eventId = `problem_${uid}_${attemptId}`;

  return db.runTransaction(async (txn) => {
    const ctx = await readUserContext(txn, uid, eventId, config);
    const attemptRef = db.doc(`problemAttempts/${attemptId}`);
    const problemRef = db.doc(`problems/${problemId}`);
    const solutionRef = db.doc(`problemSolutions/${problemId}`);
    const [attemptSnap, problemSnap, solutionSnap] = await txn.getAll(attemptRef, problemRef, solutionRef);
    if (attemptSnap.exists) {
      if (attemptSnap.get("userId") !== uid) throw new HttpsError("permission-denied", "Not your attempt.");
      return { alreadySubmitted: true, ...attemptSnap.data() };
    }
    if (!problemSnap.exists || !solutionSnap.exists) throw new HttpsError("not-found", "Problem not found.");
    const problem = problemSnap.data() as ProblemDoc;
    const solution = solutionSnap.data() as ProblemSolutionDoc;
    const progressRef = db.doc(`studentProgress/${uid}/topics/${problem.topicId}`);
    const progressSnap = await txn.get(progressRef);
    const prevProgress = progressSnap.exists
      ? (progressSnap.data() as TopicProgressDoc)
      : emptyTopicProgress(problem.topicId, problem.chapterId, problem.subjectId, problem.classLevel);
    if (problem.level > prevProgress.levelUnlocked) {
      throw new HttpsError("failed-precondition", `Level ${problem.level} is locked. Reach the unlock score on level ${prevProgress.levelUnlocked} first.`);
    }

    const correct = isCorrectAnswer(solution, finalAnswer);
    const mistakeType = correct ? null : classifyMistake(solution, { finalAnswer, steps, timeSpentSec, expectedMinutes: problem.expectedMinutes });
    const alreadySolved = prevProgress.solvedProblemIds.includes(problemId);
    const revealed = prevProgress.revealedProblemIds.includes(problemId);
    const rewarded = correct && !alreadySolved && !revealed;
    const nextProgress = mergeTopicProgress(
      prevProgress,
      { level: problem.level, attempts: 1, correct: correct ? 1 : 0, mistakeType, solvedProblemId: correct ? problemId : undefined },
      config.unlockThresholds
    );

    txn.set(attemptRef, {
      id: attemptId,
      userId: uid,
      problemId,
      topicId: problem.topicId,
      subjectId: problem.subjectId,
      level: problem.level,
      finalAnswer,
      steps,
      timeSpentSec,
      correct,
      mistakeType,
      rewarded,
      createdAt: FieldValue.serverTimestamp()
    });
    if (mistakeType) {
      const mistakeRef = db.collection("mistakes").doc();
      txn.set(mistakeRef, {
        id: mistakeRef.id,
        userId: uid,
        problemId,
        questionId: null,
        topicId: problem.topicId,
        subjectId: problem.subjectId,
        type: mistakeType,
        note: `Answered "${finalAnswer}" on ${problem.title}`,
        createdAt: FieldValue.serverTimestamp()
      });
    }
    txn.set(progressRef, { ...nextProgress, lastPracticedAt: FieldValue.serverTimestamp() });
    const levelKey = String(problem.level);
    const rewards = applyOutcome(txn, ctx, {
      eventId,
      reason: correct ? "problem_solved" : "problem_attempted",
      refId: problemId,
      xp: rewarded ? config.problemXpByLevel[levelKey] ?? 0 : 0,
      stars: rewarded ? config.problemStarsByLevel[levelKey] ?? 0 : 0,
      activity: { questions: 1 },
      stats: { questionsSolved: correct ? 1 : 0, problemsSolved: rewarded ? 1 : 0 }
    });

    return {
      alreadySubmitted: false,
      correct,
      mistakeType,
      rewarded,
      solution: correct ? publicSolution(solution) : null,
      similarProblemIds: problem.similarProblemIds,
      suggestedLevel: nextProgress.adaptive.suggestedLevel,
      levelUnlocked: nextProgress.levelUnlocked,
      accuracy: nextProgress.accuracy,
      rewards
    };
  });
});

/** Reveal the worked solution. The problem can no longer earn XP or Stars afterwards. */
export const revealSolution = onCall(async (request) => {
  const uid = requireUid(request);
  const problemId = requireString((request.data as { problemId?: unknown })?.problemId, "problemId", 120);
  const config = await loadConfig();
  return db.runTransaction(async (txn) => {
    const problemRef = db.doc(`problems/${problemId}`);
    const solutionRef = db.doc(`problemSolutions/${problemId}`);
    const [problemSnap, solutionSnap] = await txn.getAll(problemRef, solutionRef);
    if (!problemSnap.exists || !solutionSnap.exists) throw new HttpsError("not-found", "Problem not found.");
    const problem = problemSnap.data() as ProblemDoc;
    const solution = solutionSnap.data() as ProblemSolutionDoc;
    const progressRef = db.doc(`studentProgress/${uid}/topics/${problem.topicId}`);
    const progressSnap = await txn.get(progressRef);
    const prevProgress = progressSnap.exists
      ? (progressSnap.data() as TopicProgressDoc)
      : emptyTopicProgress(problem.topicId, problem.chapterId, problem.subjectId, problem.classLevel);
    const nextProgress = mergeTopicProgress(prevProgress, { level: problem.level, attempts: 0, correct: 0, revealedProblemId: problemId }, config.unlockThresholds);
    txn.set(progressRef, nextProgress, { merge: true });
    return publicSolution(solution);
  });
});
