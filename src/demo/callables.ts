// Browser-side versions of the Cloud Functions, run against the demo store. Reward, streak,
// grading and mistake logic is imported from functions/src/lib so the demo behaves like the server.
import type { OutcomeResult } from "../lib/callables";
import type {
  AiMode, DailyActivityDoc, DailyChallengeDoc, DoubtAnswerDoc, DoubtDoc, ModuleDoc, ProblemDoc, ProblemSolutionDoc, PublicProfile, QuestionKeyDoc, QuizDoc,
  RewardConfig, RewardDoc, SpinStateDoc, StreakDoc, StudyTwinPairDoc, TopicDoc, TopicProgressDoc, TwinChallengeDoc, UserDoc
} from "../lib/types";
import { scoreQuiz } from "../../functions/src/lib/quiz.js";
import { classifyMistake, isCorrectAnswer } from "../../functions/src/lib/mistakes.js";
import { emptyTopicProgress, mergeTopicProgress } from "../../functions/src/lib/progress.js";
import { canSpin, pickOutcome } from "../../functions/src/lib/spin.js";
import { fallbackResponse } from "../../functions/src/lib/aiFallback.js";
import { badgesToAward } from "../../functions/src/lib/badges.js";
import { activityQualifies, advanceStreak, newMilestones } from "../../functions/src/lib/streak.js";
import { daysBetween, istDate } from "../../functions/src/lib/time.js";
import { anonUsername, avatarFor, contentHash } from "./hash";
import { DemoError, newDocId, onWrite, readDoc, runQuery, Timestamp, writeDoc, type DocData } from "./store";

type Input = Record<string, unknown>;
type Handler = (uid: string, input: Input) => Promise<unknown>;

interface UserServerFields extends UserDoc {
  badgeIds?: string[];
  problemsSolved?: number;
  revisionsCompleted?: number;
  lastDoubtAt?: unknown;
  lastAnswerAt?: unknown;
}

function getDoc<T>(path: string): T | null {
  return readDoc(path) as T | null;
}
function requireDoc<T>(path: string, message: string, code = "not-found"): T {
  const data = getDoc<T>(path);
  if (!data) throw new DemoError(code, message);
  return data;
}
function requireString(value: unknown, name: string): string {
  if (typeof value !== "string" || !value.trim()) throw new DemoError("invalid-argument", `${name} is required.`);
  return value;
}
function parseAnswers(raw: unknown): Record<string, number> {
  const answers: Record<string, number> = {};
  if (typeof raw !== "object" || raw === null) return answers;
  for (const [questionId, choice] of Object.entries(raw as Input)) {
    if (typeof choice === "number" && Number.isInteger(choice)) answers[questionId] = choice;
  }
  return answers;
}
function config(): RewardConfig {
  return requireDoc<RewardConfig>("appConfig/rewards", "Reward config missing.");
}
function today(): string {
  return istDate(new Date());
}
function toMillis(value: unknown): number | null {
  return value instanceof Timestamp ? value.toMillis() : null;
}
function questionKeys(questionIds: string[]): Map<string, QuestionKeyDoc> {
  const keys = new Map<string, QuestionKeyDoc>();
  for (const questionId of questionIds) {
    const key = getDoc<QuestionKeyDoc>(`questionKeys/${questionId}`);
    if (key) keys.set(questionId, key);
  }
  return keys;
}
function addNotification(uid: string, type: string, title: string, body: string, link: string | null): void {
  const id = newDocId();
  writeDoc(`notifications/${uid}/items/${id}`, { id, type, title, body, link, read: false, createdAt: Timestamp.now() });
}
function eventDone(eventId: string): boolean {
  return readDoc(`processedEvents/${eventId}`) !== null;
}

interface Outcome {
  eventId: string;
  reason: string;
  refId: string;
  xp: number;
  stars: number;
  activity?: Partial<{ minutes: number; questions: number; modules: number; revisions: number }>;
  stats?: Partial<{ questionsSolved: number; modulesCompleted: number; problemsSolved: number; revisionsCompleted: number }>;
  badgeIds?: string[];
}

/** Port of functions/src/lib/engine.ts applyOutcome: ledger, balances, activity, streak, badges, public summary. */
function applyOutcome(uid: string, outcome: Outcome): OutcomeResult {
  const rewardConfig = config();
  const date = today();
  const now = Timestamp.now();
  const user = requireDoc<UserServerFields>(`users/${uid}`, "Profile not found. Complete registration first.", "failed-precondition");
  const streak = (getDoc<StreakDoc>(`streaks/${uid}`) ?? {}) as Partial<StreakDoc>;
  const previousActivity = (getDoc<DailyActivityDoc>(`dailyActivity/${uid}_${date}`) ?? {}) as Partial<DailyActivityDoc>;
  const activity = {
    minutes: (previousActivity.minutes ?? 0) + (outcome.activity?.minutes ?? 0),
    questions: (previousActivity.questions ?? 0) + (outcome.activity?.questions ?? 0),
    modules: (previousActivity.modules ?? 0) + (outcome.activity?.modules ?? 0),
    revisions: (previousActivity.revisions ?? 0) + (outcome.activity?.revisions ?? 0)
  };
  const qualifiedNow = activityQualifies(activity, rewardConfig);
  let streakResult = { current: streak.current ?? 0, longest: streak.longest ?? 0, lastQualifiedDate: streak.lastQualifiedDate ?? null, incremented: false };
  let milestones: number[] = [];
  if (qualifiedNow && !previousActivity.qualified) {
    streakResult = advanceStreak(streakResult, date);
    milestones = newMilestones(streakResult.current, rewardConfig.streakMilestones, streak.milestonesAwarded ?? []);
  }
  const stats = {
    questionsSolved: (user.questionsSolved ?? 0) + (outcome.stats?.questionsSolved ?? 0),
    modulesCompleted: (user.modulesCompleted ?? 0) + (outcome.stats?.modulesCompleted ?? 0),
    problemsSolved: (user.problemsSolved ?? 0) + (outcome.stats?.problemsSolved ?? 0),
    revisionsCompleted: (user.revisionsCompleted ?? 0) + (outcome.stats?.revisionsCompleted ?? 0)
  };
  const ownedBadges = user.badgeIds ?? [];
  const badges = [...badgesToAward({ ...stats, streakCurrent: streakResult.current }, ownedBadges), ...(outcome.badgeIds ?? [])].filter(
    (badgeId, index, all) => !ownedBadges.includes(badgeId) && all.indexOf(badgeId) === index
  );

  writeDoc(`processedEvents/${outcome.eventId}`, { userId: uid, reason: outcome.reason, refId: outcome.refId, createdAt: now });
  if (outcome.xp > 0) writeDoc(`xpTransactions/${outcome.eventId}`, { id: outcome.eventId, userId: uid, amount: outcome.xp, reason: outcome.reason, refId: outcome.refId, createdAt: now });
  if (outcome.stars !== 0) writeDoc(`starsTransactions/${outcome.eventId}`, { id: outcome.eventId, userId: uid, amount: outcome.stars, reason: outcome.reason, refId: outcome.refId, createdAt: now });
  writeDoc(`users/${uid}`, { xp: (user.xp ?? 0) + outcome.xp, stars: (user.stars ?? 0) + outcome.stars, ...stats, badgeIds: [...ownedBadges, ...badges], updatedAt: now }, true);
  writeDoc(`dailyActivity/${uid}_${date}`, { uid, date, ...activity, qualified: qualifiedNow, updatedAt: now }, true);
  writeDoc(`streaks/${uid}`, { uid, current: streakResult.current, longest: streakResult.longest, lastQualifiedDate: streakResult.lastQualifiedDate, milestonesAwarded: [...(streak.milestonesAwarded ?? []), ...milestones], updatedAt: now }, true);
  for (const badgeId of badges) writeDoc(`userBadges/${uid}/badges/${badgeId}`, { badgeId, awardedAt: now });
  for (const milestone of milestones) addNotification(uid, "streak", `${milestone}-day streak!`, `You kept a ${milestone}-day learning streak. Keep going.`, "/rewards");
  const profile = getDoc<PublicProfile>(`publicProfiles/${uid}`);
  writeDoc(`publicProfiles/${uid}`, { progressSummary: { ...(profile?.progressSummary ?? { accuracy: 0 }), questionsSolved: stats.questionsSolved, modulesCompleted: stats.modulesCompleted }, updatedAt: now }, true);

  return {
    xp: outcome.xp,
    stars: outcome.stars,
    streak: { current: streakResult.current, longest: streakResult.longest, incremented: streakResult.incremented, milestones, qualifiedToday: qualifiedNow },
    badges
  };
}

function publicSolution(solution: ProblemSolutionDoc) {
  return { finalAnswer: solution.finalAnswer, steps: solution.steps, commonMistakes: solution.commonMistakes.map((mistake) => ({ type: mistake.type, description: mistake.description })) };
}

function topicProgress(uid: string, topicId: string, fallback: () => TopicProgressDoc): TopicProgressDoc {
  return getDoc<TopicProgressDoc>(`studentProgress/${uid}/topics/${topicId}`) ?? fallback();
}

const GUIDANCE_MODES = new Set<AiMode>(["hint", "guide", "check_approach", "find_mistake", "solve_with_me"]);
const AI_MODES = new Set<AiMode>(["hint", "identify_concept", "guide", "check_approach", "find_mistake", "full_explanation", "explain", "solve_with_me", "generate_questions", "check_answer", "revision", "exam"]);
const DEMO_AI_NOTICE: string | null = null;

function assertCooldown(lastAt: unknown, cooldownSec: number, what: string): void {
  const lastMs = toMillis(lastAt);
  if (lastMs !== null && Date.now() - lastMs < cooldownSec * 1000) {
    const wait = Math.ceil((cooldownSec * 1000 - (Date.now() - lastMs)) / 1000);
    throw new DemoError("resource-exhausted", `Please wait ${wait}s before posting another ${what}.`);
  }
}

export const callables: Record<string, Handler> = {
  async startModule(uid, input) {
    const moduleId = requireString(input.moduleId, "moduleId");
    const module = requireDoc<ModuleDoc>(`modules/${moduleId}`, "Module not found.");
    const path = `studentProgress/${uid}/modules/${moduleId}`;
    const existing = getDoc<{ status: string }>(path);
    if (existing) return { status: existing.status };
    writeDoc(path, { moduleId, topicId: module.topicId, subjectId: module.subjectId, status: "started", startedAt: Timestamp.now(), completedAt: null });
    return { status: "started" };
  },

  async completeModule(uid, input) {
    const moduleId = requireString(input.moduleId, "moduleId");
    const eventId = `module_${uid}_${moduleId}`;
    const module = requireDoc<ModuleDoc>(`modules/${moduleId}`, "Module not found.");
    const path = `studentProgress/${uid}/modules/${moduleId}`;
    const existing = getDoc<{ status: string; startedAt: unknown }>(path);
    if (eventDone(eventId) || existing?.status === "completed") return { alreadyCompleted: true, xp: 0, stars: 0 };
    writeDoc(path, { moduleId, topicId: module.topicId, subjectId: module.subjectId, status: "completed", startedAt: existing?.startedAt ?? Timestamp.now(), completedAt: Timestamp.now() }, true);
    const result = applyOutcome(uid, { eventId, reason: "module_completed", refId: moduleId, xp: config().moduleXp, stars: 0, activity: { modules: 1 }, stats: { modulesCompleted: 1 } });
    return { alreadyCompleted: false, ...result };
  },

  async finalizeQuiz(uid, input) {
    const attemptId = requireString(input.attemptId, "attemptId");
    const quizId = requireString(input.quizId, "quizId");
    const answers = parseAnswers(input.answers);
    const rewardConfig = config();
    const eventId = `quiz_${uid}_${attemptId}`;
    const existing = getDoc<{ userId: string }>(`quizAttempts/${attemptId}`);
    if (existing) {
      if (existing.userId !== uid) throw new DemoError("permission-denied", "Not your attempt.");
      return { alreadyFinalized: true, ...existing };
    }
    const quiz = requireDoc<QuizDoc>(`quizzes/${quizId}`, "Quiz not found.");
    const scored = scoreQuiz(quiz.questionIds, answers, questionKeys(quiz.questionIds));
    const firstCompletion = getDoc(`quizCompletions/${uid}_${quizId}`) === null;
    const topic = getDoc<TopicDoc>(`topics/${quiz.topicId}`);
    const nextProgress = mergeTopicProgress(
      topicProgress(uid, quiz.topicId, () => emptyTopicProgress(quiz.topicId, topic?.chapterId ?? "", quiz.subjectId, quiz.classLevel)),
      { level: quiz.level, attempts: scored.total, correct: scored.score },
      rewardConfig.unlockThresholds
    );
    const now = Timestamp.now();
    writeDoc(`quizAttempts/${attemptId}`, { id: attemptId, userId: uid, quizId, answers, finalized: true, score: scored.score, total: scored.total, results: scored.results, createdAt: now, finalizedAt: now });
    writeDoc(`studentProgress/${uid}/topics/${quiz.topicId}`, { ...nextProgress, lastPracticedAt: now });
    if (firstCompletion) writeDoc(`quizCompletions/${uid}_${quizId}`, { userId: uid, quizId, attemptId, score: scored.score, total: scored.total, createdAt: now });
    const rewards = applyOutcome(uid, {
      eventId, reason: "quiz_completed", refId: quizId,
      xp: firstCompletion ? scored.total * rewardConfig.quizXpPerQuestion : 0,
      stars: firstCompletion ? scored.score * rewardConfig.quizStarsPerCorrect : 0,
      activity: { questions: scored.total }, stats: { questionsSolved: scored.score }
    });
    return { alreadyFinalized: false, firstCompletion, score: scored.score, total: scored.total, results: scored.results, levelUnlocked: nextProgress.levelUnlocked, rewards };
  },

  async submitProblemAttempt(uid, input) {
    const attemptId = requireString(input.attemptId, "attemptId");
    const problemId = requireString(input.problemId, "problemId");
    const finalAnswer = requireString(input.finalAnswer, "finalAnswer");
    const steps = (typeof input.steps === "object" && input.steps ? input.steps : {}) as Record<string, string>;
    const timeSpentSec = typeof input.timeSpentSec === "number" ? input.timeSpentSec : 0;
    const rewardConfig = config();
    const eventId = `problem_${uid}_${attemptId}`;
    const existing = getDoc<{ userId: string }>(`problemAttempts/${attemptId}`);
    if (existing) {
      if (existing.userId !== uid) throw new DemoError("permission-denied", "Not your attempt.");
      return { alreadySubmitted: true, ...existing };
    }
    const problem = requireDoc<ProblemDoc>(`problems/${problemId}`, "Problem not found.");
    const solution = requireDoc<ProblemSolutionDoc>(`problemSolutions/${problemId}`, "Problem not found.");
    const prevProgress = topicProgress(uid, problem.topicId, () => emptyTopicProgress(problem.topicId, problem.chapterId, problem.subjectId, problem.classLevel));
    if (problem.level > prevProgress.levelUnlocked) {
      throw new DemoError("failed-precondition", `Level ${problem.level} is locked. Reach the unlock score on level ${prevProgress.levelUnlocked} first.`);
    }
    const correct = isCorrectAnswer(solution, finalAnswer);
    const mistakeType = correct ? null : classifyMistake(solution, { finalAnswer, steps, timeSpentSec, expectedMinutes: problem.expectedMinutes });
    const rewarded = correct && !prevProgress.solvedProblemIds.includes(problemId) && !prevProgress.revealedProblemIds.includes(problemId);
    const nextProgress = mergeTopicProgress(
      prevProgress,
      { level: problem.level, attempts: 1, correct: correct ? 1 : 0, mistakeType, solvedProblemId: correct ? problemId : undefined },
      rewardConfig.unlockThresholds
    );
    const now = Timestamp.now();
    writeDoc(`problemAttempts/${attemptId}`, { id: attemptId, userId: uid, problemId, topicId: problem.topicId, subjectId: problem.subjectId, level: problem.level, finalAnswer, steps, timeSpentSec, correct, mistakeType, rewarded, createdAt: now });
    if (mistakeType) {
      const mistakeId = newDocId();
      writeDoc(`mistakes/${mistakeId}`, { id: mistakeId, userId: uid, problemId, questionId: null, topicId: problem.topicId, subjectId: problem.subjectId, type: mistakeType, note: `Answered "${finalAnswer}" on ${problem.title}`, createdAt: now });
    }
    writeDoc(`studentProgress/${uid}/topics/${problem.topicId}`, { ...nextProgress, lastPracticedAt: now });
    const levelKey = String(problem.level);
    const rewards = applyOutcome(uid, {
      eventId, reason: correct ? "problem_solved" : "problem_attempted", refId: problemId,
      xp: rewarded ? rewardConfig.problemXpByLevel[levelKey] ?? 0 : 0,
      stars: rewarded ? rewardConfig.problemStarsByLevel[levelKey] ?? 0 : 0,
      activity: { questions: 1 }, stats: { questionsSolved: correct ? 1 : 0, problemsSolved: rewarded ? 1 : 0 }
    });
    return {
      alreadySubmitted: false, correct, mistakeType, rewarded,
      solution: correct ? publicSolution(solution) : null,
      similarProblemIds: problem.similarProblemIds,
      suggestedLevel: nextProgress.adaptive.suggestedLevel,
      levelUnlocked: nextProgress.levelUnlocked,
      accuracy: nextProgress.accuracy,
      rewards
    };
  },

  async revealSolution(uid, input) {
    const problemId = requireString(input.problemId, "problemId");
    const problem = requireDoc<ProblemDoc>(`problems/${problemId}`, "Problem not found.");
    const solution = requireDoc<ProblemSolutionDoc>(`problemSolutions/${problemId}`, "Problem not found.");
    const prevProgress = topicProgress(uid, problem.topicId, () => emptyTopicProgress(problem.topicId, problem.chapterId, problem.subjectId, problem.classLevel));
    const nextProgress = mergeTopicProgress(prevProgress, { level: problem.level, attempts: 0, correct: 0, revealedProblemId: problemId }, config().unlockThresholds);
    writeDoc(`studentProgress/${uid}/topics/${problem.topicId}`, { ...nextProgress }, true);
    return publicSolution(solution);
  },

  async completeDailyChallenge(uid, input) {
    const challengeId = requireString(input.challengeId, "challengeId");
    const answers = parseAnswers(input.answers);
    const rewardConfig = config();
    const date = today();
    const eventId = `challenge_${uid}_${date}`;
    const challenges = runQuery({ path: "dailyChallenges", filters: [], orders: [{ field: "order", direction: "asc" }], max: null }).map((row) => row.data as unknown as DailyChallengeDoc);
    const count = challenges.length;
    const todays = challenges[count === 0 ? 0 : ((daysBetween("2026-01-01", date) % count) + count) % count];
    if (!todays || todays.id !== challengeId) throw new DemoError("failed-precondition", "That is not today's challenge.");
    const completion = getDoc<DocData>(`challengeCompletions/${uid}_${date}`);
    if (eventDone(eventId) || completion) return { alreadyCompleted: true, ...(completion ?? {}) };
    const scored = scoreQuiz(todays.questionIds, answers, questionKeys(todays.questionIds));
    writeDoc(`challengeCompletions/${uid}_${date}`, { id: `${uid}_${date}`, userId: uid, challengeId, date, score: scored.score, total: scored.total, results: scored.results, createdAt: Timestamp.now() });
    const rewards = applyOutcome(uid, { eventId, reason: "daily_challenge", refId: challengeId, xp: rewardConfig.challengeXp, stars: rewardConfig.challengeStars, activity: { questions: scored.total }, stats: { questionsSolved: scored.score } });
    return { alreadyCompleted: false, score: scored.score, total: scored.total, results: scored.results, rewards };
  },

  async spinWheel(uid) {
    const rewardConfig = config();
    const state = (getDoc<SpinStateDoc>(`spinState/${uid}`) ?? { totalSpins: 0, nextSpinAt: null }) as Partial<SpinStateDoc>;
    const totalSpins = state.totalSpins ?? 0;
    const eventId = `spin_${uid}_${totalSpins + 1}`;
    if (eventDone(eventId)) throw new DemoError("already-exists", "Spin already in progress. Refresh to see the result.");
    if (!canSpin(toMillis(state.nextSpinAt), Date.now())) throw new DemoError("failed-precondition", "Spin is on cooldown.");
    const outcome = pickOutcome(rewardConfig.spinOutcomes, Math.random());
    const nextSpinAt = Timestamp.fromMillis(Date.now() + rewardConfig.spinCooldownHours * 3600_000);
    writeDoc(`spinState/${uid}`, { uid, nextSpinAt, lastResult: outcome.label, totalSpins: totalSpins + 1 }, true);
    writeDoc(`spinHistory/${eventId}`, { id: eventId, userId: uid, result: outcome.label, xp: outcome.xp, stars: outcome.stars, createdAt: Timestamp.now() });
    const rewards = applyOutcome(uid, { eventId, reason: "spin_wheel", refId: eventId, xp: outcome.xp, stars: outcome.stars, badgeIds: outcome.badgeId ? [outcome.badgeId] : [] });
    return { result: outcome.label, xp: outcome.xp, stars: outcome.stars, badgeId: outcome.badgeId, nextSpinAt: nextSpinAt.toMillis(), rewards };
  },

  async claimReward(uid, input) {
    const rewardId = requireString(input.rewardId, "rewardId");
    const claimKey = requireString(input.claimKey, "claimKey");
    const claimId = `${uid}_${claimKey}`;
    const eventId = `claim_${claimId}`;
    const existingClaim = getDoc<DocData>(`rewardClaims/${claimId}`);
    if (eventDone(eventId) || existingClaim) return { alreadyClaimed: true, claimId, ...(existingClaim ?? {}) };
    const reward = requireDoc<RewardDoc>(`rewards/${rewardId}`, "Reward not found.");
    if (!reward.available) throw new DemoError("failed-precondition", "This reward is not available right now.");
    if (reward.oncePerUser) {
      const prior = runQuery({ path: "rewardClaims", filters: [{ field: "userId", op: "==", value: uid }, { field: "rewardId", op: "==", value: rewardId }], orders: [], max: 1 });
      if (prior.length) throw new DemoError("already-exists", "You have already claimed this reward.");
    }
    const user = requireDoc<UserDoc>(`users/${uid}`, "Profile not found.", "failed-precondition");
    if (user.stars < reward.starsRequired) throw new DemoError("failed-precondition", `You need ${reward.starsRequired - user.stars} more Stars.`);
    writeDoc(`rewardClaims/${claimId}`, { id: claimId, userId: uid, rewardId, rewardName: reward.name, starsSpent: reward.starsRequired, type: "store", status: "pending", createdAt: Timestamp.now() });
    applyOutcome(uid, { eventId, reason: "reward_claim", refId: rewardId, xp: 0, stars: -reward.starsRequired });
    addNotification(uid, "reward", "Reward claimed", `${reward.name} is pending fulfilment.`, "/rewards");
    return { alreadyClaimed: false, claimId, starsSpent: reward.starsRequired, remainingStars: user.stars - reward.starsRequired };
  },

  async recordStudySession(uid, input) {
    const sessionId = requireString(input.sessionId, "sessionId");
    const kind = requireString(input.kind, "kind");
    if (!["learning", "revision", "problems"].includes(kind)) throw new DemoError("invalid-argument", "Invalid session kind.");
    const minutes = Math.round(Math.min(60, Math.max(1, typeof input.minutes === "number" ? input.minutes : 1)));
    const topicId = typeof input.topicId === "string" ? input.topicId : null;
    const rewardConfig = config();
    const eventId = `session_${uid}_${sessionId}`;
    if (eventDone(eventId)) return { alreadyRecorded: true };
    const activity = (getDoc<DailyActivityDoc>(`dailyActivity/${uid}_${today()}`) ?? {}) as Partial<DailyActivityDoc>;
    const allowedMinutes = Math.max(0, Math.min(minutes, 600 - (activity.minutes ?? 0)));
    const isRevision = kind === "revision";
    writeDoc(`studySessions/${eventId}`, { id: eventId, userId: uid, topicId, kind, minutes: allowedMinutes, date: today(), createdAt: Timestamp.now() });
    const rewards = applyOutcome(uid, {
      eventId, reason: isRevision ? "revision_session" : "study_session", refId: topicId ?? kind,
      xp: isRevision ? rewardConfig.revisionXp : allowedMinutes * rewardConfig.studyMinuteXp, stars: 0,
      activity: { minutes: allowedMinutes, revisions: isRevision ? 1 : 0 }, stats: { revisionsCompleted: isRevision ? 1 : 0 }
    });
    return { alreadyRecorded: false, minutesCounted: allowedMinutes, rewards };
  },

  async askAi(uid, input) {
    const sessionId = requireString(input.sessionId, "sessionId");
    const mode = requireString(input.mode, "mode") as AiMode;
    if (!AI_MODES.has(mode)) throw new DemoError("invalid-argument", "Unknown mode.");
    const message = typeof input.message === "string" ? input.message.trim() : "";
    const learningMode = input.learningMode === true;
    const problemId = typeof input.problemId === "string" ? input.problemId : null;
    const topicId = typeof input.topicId === "string" ? input.topicId : null;
    const rewardConfig = config();
    const usagePath = `aiUsage/${uid}_${today()}`;
    const used = getDoc<{ count: number }>(usagePath)?.count ?? 0;
    if (used >= rewardConfig.aiDailyLimit) throw new DemoError("resource-exhausted", `Daily AI limit of ${rewardConfig.aiDailyLimit} reached. It resets at midnight IST.`);
    writeDoc(usagePath, { uid, date: today(), count: used + 1, updatedAt: Timestamp.now() }, true);
    const solution = problemId ? getDoc<ProblemSolutionDoc>(`problemSolutions/${problemId}`) : null;
    const problem = problemId ? getDoc<ProblemDoc>(`problems/${problemId}`) : null;
    const topic = topicId ? getDoc<TopicDoc>(`topics/${topicId}`) : null;
    const messagesPath = `aiSessions/${uid}/messages`;
    const guidanceTurns = runQuery({ path: messagesPath, filters: [{ field: "sessionId", op: "==", value: sessionId }, { field: "role", op: "==", value: "assistant" }], orders: [], max: null })
      .filter((row) => GUIDANCE_MODES.has(row.data.mode as AiMode)).length;
    let text: string | null = null;
    let source: "gemini" | "fallback" = "fallback";
    let notice: string | null = DEMO_AI_NOTICE;

    // Check if live server backend is available
    if (typeof window !== "undefined" && typeof fetch === "function") {
      try {
        const user = getDoc<UserDoc>(`users/${uid}`);
        const res = await fetch("/api/ai/ask", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            sessionId,
            mode,
            message,
            topicId,
            problemId,
            attemptAnswer: input.attemptAnswer,
            attemptSteps: input.attemptSteps,
            learningMode,
            guidanceTurns,
            topicName: topic?.name ?? null,
            problemTitle: problem?.title ?? null,
            userClass: user?.classLevel ?? 10,
            userGoal: user?.goal ?? "general"
          })
        });
        if (res.ok) {
          const json = await res.json();
          if (json.text) {
            text = json.text;
            source = json.source ?? "gemini";
            notice = json.notice ?? null;
          }
        }
      } catch {
        // Fall back gracefully
      }
    }

    if (!text) {
      text = fallbackResponse({ mode, solution, topic, problemTitle: problem?.title ?? null, learningMode, guidanceTurns, message });
    }
    if (!text) {
      text = "I am EduQuest AI Tutor! How can I help you today? Feel free to ask any question across school subjects, coding, exam prep, or study guidance.";
    }

    const userMessageId = newDocId();
    const assistantId = newDocId();
    writeDoc(`${messagesPath}/${userMessageId}`, { id: userMessageId, sessionId, role: "user", mode, text: message || mode, source: null, createdAt: Timestamp.now() });
    writeDoc(`${messagesPath}/${assistantId}`, { id: assistantId, sessionId, role: "assistant", mode, text, source, createdAt: Timestamp.fromMillis(Date.now() + 1) });
    return { text, source, notice, remaining: rewardConfig.aiDailyLimit - used - 1, guidanceTurns: guidanceTurns + (GUIDANCE_MODES.has(mode) ? 1 : 0) };
  },

  async postDoubt(uid, input) {
    const subjectId = requireString(input.subjectId, "subjectId");
    const title = requireString(input.title, "title");
    const body = requireString(input.body, "body");
    const chapterId = typeof input.chapterId === "string" && input.chapterId ? input.chapterId : null;
    const topicId = typeof input.topicId === "string" && input.topicId ? input.topicId : null;
    const author = requireDoc<PublicProfile>(`publicProfiles/${uid}`, "Profile not ready yet. Try again in a moment.", "failed-precondition");
    const user = requireDoc<UserServerFields>(`users/${uid}`, "Profile not found.", "failed-precondition");
    assertCooldown(user.lastDoubtAt, config().doubtCooldownSec, "doubt");
    const hash = contentHash(`${title} ${body}`);
    const duplicate = runQuery({ path: "doubts", filters: [{ field: "authorId", op: "==", value: uid }, { field: "contentHash", op: "==", value: hash }], orders: [], max: 1 });
    if (duplicate.length) throw new DemoError("already-exists", "You already posted this doubt.");
    const doubtId = newDocId();
    writeDoc(`doubts/${doubtId}`, { id: doubtId, authorId: uid, authorName: author.anonUsername, subjectId, chapterId, topicId, title, body, status: "open", hidden: false, answerCount: 0, voteCount: 0, contentHash: hash, createdAt: Timestamp.now() });
    writeDoc(`users/${uid}`, { lastDoubtAt: Timestamp.now() }, true);
    return { doubtId };
  },

  async postAnswer(uid, input) {
    const doubtId = requireString(input.doubtId, "doubtId");
    const body = requireString(input.body, "body");
    const author = requireDoc<PublicProfile>(`publicProfiles/${uid}`, "Profile not ready yet. Try again in a moment.", "failed-precondition");
    const user = requireDoc<UserServerFields>(`users/${uid}`, "Profile not found.", "failed-precondition");
    const doubt = getDoc<DoubtDoc>(`doubts/${doubtId}`);
    if (!doubt || doubt.hidden) throw new DemoError("not-found", "Doubt not found.");
    assertCooldown(user.lastAnswerAt, config().answerCooldownSec, "answer");
    if (getDoc(`blocks/${doubt.authorId}/users/${uid}`)) throw new DemoError("permission-denied", "You cannot interact with this student.");
    const hash = contentHash(body);
    const duplicate = runQuery({ path: `doubts/${doubtId}/answers`, filters: [{ field: "authorId", op: "==", value: uid }, { field: "contentHash", op: "==", value: hash }], orders: [], max: 1 });
    if (duplicate.length) throw new DemoError("already-exists", "You already posted this answer.");
    const answerId = newDocId();
    writeDoc(`doubts/${doubtId}/answers/${answerId}`, { id: answerId, doubtId, authorId: uid, authorName: author.anonUsername, body, voteCount: 0, hidden: false, contentHash: hash, createdAt: Timestamp.now() });
    writeDoc(`doubts/${doubtId}`, { answerCount: doubt.answerCount + 1, status: doubt.status === "open" ? "answered" : doubt.status }, true);
    writeDoc(`users/${uid}`, { lastAnswerAt: Timestamp.now() }, true);
    if (doubt.authorId !== uid) addNotification(doubt.authorId, "doubt", "New answer to your doubt", `${author.anonUsername} answered "${doubt.title}".`, `/doubts/${doubtId}`);
    return { answerId };
  },

  async voteAnswer(uid, input) {
    const doubtId = requireString(input.doubtId, "doubtId");
    const answerId = requireString(input.answerId, "answerId");
    if (getDoc(`votes/${uid}_${answerId}`)) throw new DemoError("already-exists", "You already upvoted this answer.");
    const answer = getDoc<DoubtAnswerDoc>(`doubts/${doubtId}/answers/${answerId}`);
    if (!answer || answer.hidden) throw new DemoError("not-found", "Answer not found.");
    if (answer.authorId === uid) throw new DemoError("failed-precondition", "You cannot upvote your own answer.");
    const doubt = requireDoc<DoubtDoc>(`doubts/${doubtId}`, "Doubt not found.");
    writeDoc(`votes/${uid}_${answerId}`, { id: `${uid}_${answerId}`, userId: uid, doubtId, answerId, createdAt: Timestamp.now() });
    writeDoc(`doubts/${doubtId}/answers/${answerId}`, { voteCount: answer.voteCount + 1 }, true);
    writeDoc(`doubts/${doubtId}`, { voteCount: doubt.voteCount + 1 }, true);
    return { voteCount: answer.voteCount + 1 };
  },

  async matchStudyTwin(uid) {
    const me = requireDoc<PublicProfile>(`publicProfiles/${uid}`, "Profile not ready yet.", "failed-precondition");
    if (me.twinPairId) return { status: "matched", pairId: me.twinPairId };
    const candidates = runQuery({
      path: "publicProfiles",
      filters: [{ field: "classLevel", op: "==", value: me.classLevel }, { field: "goal", op: "==", value: me.goal }, { field: "twinStatus", op: "==", value: "searching" }],
      orders: [], max: 10
    })
      .filter((row) => row.id !== uid)
      .sort((left, right) => Math.abs((left.data.level as number) - me.level) - Math.abs((right.data.level as number) - me.level));
    const partner = candidates[0];
    const now = Timestamp.now();
    if (!partner) {
      writeDoc(`publicProfiles/${uid}`, { twinStatus: "searching", updatedAt: now }, true);
      return { status: "searching", pairId: null };
    }
    const pairId = newDocId();
    writeDoc(`studyTwins/${pairId}`, { id: pairId, members: [uid, partner.id], classLevel: me.classLevel, goal: me.goal, status: "active", createdAt: now });
    writeDoc(`publicProfiles/${uid}`, { twinStatus: "matched", twinPairId: pairId, updatedAt: now }, true);
    writeDoc(`publicProfiles/${partner.id}`, { twinStatus: "matched", twinPairId: pairId, updatedAt: now }, true);
    addNotification(partner.id, "twin", "Study Twin matched", `${me.anonUsername} is your new Study Twin.`, "/study-twin");
    return { status: "matched", pairId };
  },

  async createTwinChallenge(uid, input) {
    const pairId = requireString(input.pairId, "pairId");
    const pair = getDoc<StudyTwinPairDoc>(`studyTwins/${pairId}`);
    if (!pair || !pair.members.includes(uid)) throw new DemoError("permission-denied", "Not your pair.");
    const questions = runQuery({ path: "questions", filters: [{ field: "classLevel", op: "==", value: pair.classLevel }], orders: [], max: 30 });
    if (questions.length < 5) throw new DemoError("failed-precondition", "Not enough questions for this class yet.");
    const seed = Array.from(pairId).reduce((sum, char) => sum + char.charCodeAt(0), 0);
    const questionIds = questions.map((row) => row.id).sort().filter((_, index) => (index + seed) % Math.ceil(questions.length / 5) === 0).slice(0, 5);
    const challengeId = newDocId();
    writeDoc(`twinChallenges/${challengeId}`, { id: challengeId, pairId, members: pair.members, questionIds, results: {}, createdAt: Timestamp.now() });
    const partnerId = pair.members.find((member) => member !== uid);
    if (partnerId) addNotification(partnerId, "twin", "Study Twin challenge", "Your twin started a 5-question challenge.", "/study-twin");
    return { challengeId, questionIds };
  },

  async submitTwinChallenge(uid, input) {
    const challengeId = requireString(input.challengeId, "challengeId");
    const answers = parseAnswers(input.answers);
    const challenge = requireDoc<TwinChallengeDoc>(`twinChallenges/${challengeId}`, "Challenge not found.");
    if (!challenge.members.includes(uid)) throw new DemoError("permission-denied", "Not your challenge.");
    if (challenge.results[uid]) return { alreadySubmitted: true, ...challenge.results[uid] };
    const scored = scoreQuiz(challenge.questionIds, answers, questionKeys(challenge.questionIds));
    writeDoc(`twinChallenges/${challengeId}`, { results: { ...challenge.results, [uid]: { score: scored.score, total: scored.total, completedAt: Timestamp.now() } } }, true);
    return { alreadySubmitted: false, score: scored.score, total: scored.total, results: scored.results };
  }
};

let triggersInstalled = false;

/** Mirror of the syncPublicProfile Firestore trigger: users/{uid} writes keep the public profile, streak and spin state in step. */
export function installTriggers(): void {
  if (triggersInstalled) return;
  triggersInstalled = true;
  onWrite((path) => {
    const segments = path.split("/");
    if (segments.length !== 2 || segments[0] !== "users") return;
    const uid = segments[1];
    const user = getDoc<UserDoc>(path);
    if (!user) return;
    const existing = getDoc<PublicProfile>(`publicProfiles/${uid}`);
    const now = Timestamp.now();
    writeDoc(`publicProfiles/${uid}`, {
      uid, anonUsername: anonUsername(uid), avatar: avatarFor(uid), classLevel: user.classLevel, goal: user.goal, subjects: user.subjects ?? [],
      ...(existing ? {} : { level: 1, progressSummary: { accuracy: 0, questionsSolved: 0, modulesCompleted: 0 }, twinStatus: "none", twinPairId: null }),
      updatedAt: now
    }, true);
    if (!existing) {
      writeDoc(`streaks/${uid}`, { uid, current: 0, longest: 0, lastQualifiedDate: null, milestonesAwarded: [], updatedAt: now }, true);
      writeDoc(`spinState/${uid}`, { uid, nextSpinAt: null, lastResult: null, totalSpins: 0 }, true);
    }
  });
}
