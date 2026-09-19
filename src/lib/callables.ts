import { httpsCallable } from "firebase/functions";
import { functions } from "./firebase";
import type { AiMode, AiSource, MistakeType, Level, ProblemSolutionDoc } from "./types";

function call<Input, Output>(name: string) {
  const callable = httpsCallable<Input, Output>(functions, name);
  return async (input: Input): Promise<Output> => (await callable(input)).data;
}

export interface OutcomeResult {
  xp: number;
  stars: number;
  streak: { current: number; longest: number; incremented: boolean; milestones: number[]; qualifiedToday: boolean };
  badges: string[];
}

export type QuizResults = Record<string, { correctIndex: number; explanation: string; correct: boolean }>;

export type PublicSolution = Pick<ProblemSolutionDoc, "finalAnswer" | "steps"> & { commonMistakes: { type: MistakeType; description: string }[] };

export const api = {
  startModule: call<{ moduleId: string }, { status: string }>("startModule"),
  completeModule: call<{ moduleId: string }, { alreadyCompleted: boolean } & Partial<OutcomeResult>>("completeModule"),
  finalizeQuiz: call<
    { attemptId: string; quizId: string; answers: Record<string, number> },
    { alreadyFinalized: boolean; firstCompletion?: boolean; score: number; total: number; results: QuizResults; levelUnlocked?: Level; rewards?: OutcomeResult }
  >("finalizeQuiz"),
  submitProblemAttempt: call<
    { attemptId: string; problemId: string; finalAnswer: string; steps: Record<string, string>; timeSpentSec: number },
    {
      alreadySubmitted: boolean;
      correct: boolean;
      mistakeType: MistakeType | null;
      rewarded: boolean;
      solution: PublicSolution | null;
      similarProblemIds: string[];
      suggestedLevel: Level;
      levelUnlocked: Level;
      accuracy: number;
      rewards?: OutcomeResult;
    }
  >("submitProblemAttempt"),
  revealSolution: call<{ problemId: string }, PublicSolution>("revealSolution"),
  completeDailyChallenge: call<
    { challengeId: string; answers: Record<string, number> },
    { alreadyCompleted: boolean; score: number; total: number; results?: QuizResults; rewards?: OutcomeResult }
  >("completeDailyChallenge"),
  spinWheel: call<Record<string, never>, { result: string; xp: number; stars: number; badgeId: string | null; nextSpinAt: number; rewards: OutcomeResult }>("spinWheel"),
  claimReward: call<{ rewardId: string; claimKey: string }, { alreadyClaimed: boolean; claimId: string; starsSpent?: number; remainingStars?: number }>("claimReward"),
  recordStudySession: call<
    { sessionId: string; topicId: string | null; minutes: number; kind: "learning" | "revision" | "problems" },
    { alreadyRecorded: boolean; minutesCounted?: number; rewards?: OutcomeResult }
  >("recordStudySession"),
  askAi: call<
    { sessionId: string; mode: AiMode; message?: string; learningMode?: boolean; problemId?: string | null; topicId?: string | null; attemptAnswer?: string; attemptSteps?: string },
    { text: string; source: AiSource; notice: string | null; remaining: number; guidanceTurns: number }
  >("askAi"),
  postDoubt: call<{ subjectId: string; chapterId: string | null; topicId: string | null; title: string; body: string }, { doubtId: string }>("postDoubt"),
  postAnswer: call<{ doubtId: string; body: string }, { answerId: string }>("postAnswer"),
  voteAnswer: call<{ doubtId: string; answerId: string }, { voteCount: number }>("voteAnswer"),
  matchStudyTwin: call<Record<string, never>, { status: "matched" | "searching"; pairId: string | null }>("matchStudyTwin"),
  createTwinChallenge: call<{ pairId: string }, { challengeId: string; questionIds: string[] }>("createTwinChallenge"),
  submitTwinChallenge: call<{ challengeId: string; answers: Record<string, number> }, { alreadySubmitted: boolean; score: number; total: number; results?: QuizResults }>("submitTwinChallenge")
};

/** Human-readable message from a Functions or Firestore error. Never exposes internals. */
export function errorMessage(error: unknown, fallback = "Something went wrong. Try again."): string {
  if (typeof error === "object" && error !== null) {
    const { code, message } = error as { code?: string; message?: string };
    if (code === "permission-denied" || code === "functions/permission-denied") return "You do not have permission to do that.";
    if (code === "unauthenticated" || code === "functions/unauthenticated") return "Please sign in again.";
    if (code === "functions/unavailable" || code === "unavailable") return message || "Service temporarily unavailable.";
    if (code === "functions/resource-exhausted") return message || "You are doing that too often. Please wait a bit.";
    if (message && !message.includes("INTERNAL") && !message.includes("undefined")) return message;
  }
  return fallback;
}
