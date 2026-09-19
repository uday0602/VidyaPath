import type { MistakeType, StudyPlanAllocation, TopicProgressDoc } from "./types";
import { MISTAKE_LABELS } from "./types";

export interface PlannerInput {
  minutesPerDay: number;
  daysToExam: number | null;
  weakTopicCount: number;
  pendingModuleCount: number;
}

/**
 * Deterministic split of daily minutes. Base ratio 25/33/17/13/8/4, tilted toward
 * problem solving and revision as the exam approaches, and toward learning when many
 * modules are still pending. Always sums exactly to minutesPerDay.
 */
export function allocateStudyTime(input: PlannerInput): StudyPlanAllocation {
  const weights = { learning: 25, problems: 33, revision: 17, quiz: 13, ai: 8, breaks: 4 };
  if (input.daysToExam !== null && input.daysToExam <= 30) {
    weights.learning -= 10;
    weights.revision += 6;
    weights.problems += 4;
  }
  if (input.pendingModuleCount > 5) {
    weights.learning += 8;
    weights.quiz -= 4;
    weights.ai -= 4;
  }
  if (input.weakTopicCount >= 3) {
    weights.revision += 5;
    weights.learning -= 5;
  }
  const total = Object.values(weights).reduce((sum, weight) => sum + weight, 0);
  const keys = Object.keys(weights) as (keyof StudyPlanAllocation)[];
  const allocation = {} as StudyPlanAllocation;
  let assigned = 0;
  keys.forEach((key, index) => {
    const isLast = index === keys.length - 1;
    const minutes = isLast ? input.minutesPerDay - assigned : Math.round((input.minutesPerDay * weights[key]) / total);
    allocation[key] = Math.max(0, minutes);
    assigned += allocation[key];
  });
  return allocation;
}

export interface TopicSummary {
  topicId: string;
  topicName: string;
  subjectName: string;
  accuracy: number;
  attempts: number;
  mainMistake: MistakeType | null;
  levelUnlocked: number;
  lastPracticedAt: Date | null;
}

export interface Recommendation {
  kind: "revise" | "practice" | "learn" | "challenge" | "level_up";
  title: string;
  reason: string;
  minutes: number;
  link: string;
  topicId: string | null;
}

export const WEAK_ACCURACY = 65;

/** Weak topics: attempted enough to judge, accuracy below the threshold, worst first. */
export function weakTopics(topics: TopicSummary[]): TopicSummary[] {
  return topics.filter((topic) => topic.attempts >= 3 && topic.accuracy < WEAK_ACCURACY).sort((left, right) => left.accuracy - right.accuracy);
}

/**
 * "What should I study now?" One deterministic answer with a one-sentence reason.
 * Priority: weakest topic → stale topic → pending module → next level → daily challenge.
 */
export function recommendNext(topics: TopicSummary[], pendingModule: { moduleId: string; title: string } | null, challengeDone: boolean, now = new Date()): Recommendation {
  const weakest = weakTopics(topics)[0];
  if (weakest) {
    const cause = weakest.mainMistake ? ` Main issue: ${MISTAKE_LABELS[weakest.mainMistake]}.` : "";
    return {
      kind: "revise",
      title: `Revise ${weakest.topicName} for 20 minutes`,
      reason: `Your recent accuracy in ${weakest.topicName} is ${Math.round(weakest.accuracy)}%.${cause}`,
      minutes: 20,
      link: `/problem-lab?topic=${weakest.topicId}&level=${Math.max(1, weakest.levelUnlocked - 1)}`,
      topicId: weakest.topicId
    };
  }
  const stale = topics
    .filter((topic) => topic.lastPracticedAt && now.getTime() - topic.lastPracticedAt.getTime() > 7 * 86_400_000)
    .sort((left, right) => (left.lastPracticedAt?.getTime() ?? 0) - (right.lastPracticedAt?.getTime() ?? 0))[0];
  if (stale) {
    return {
      kind: "practice",
      title: `Quick practice on ${stale.topicName}`,
      reason: `You have not touched ${stale.topicName} for over a week. Ten problems keep it fresh.`,
      minutes: 15,
      link: `/problem-lab?topic=${stale.topicId}`,
      topicId: stale.topicId
    };
  }
  if (pendingModule) {
    return {
      kind: "learn",
      title: `Continue "${pendingModule.title}"`,
      reason: "This module is next on your learning path and is not completed yet.",
      minutes: 25,
      link: `/learn/module/${pendingModule.moduleId}`,
      topicId: null
    };
  }
  const ready = topics.filter((topic) => topic.accuracy >= 80 && topic.attempts >= 5 && topic.levelUnlocked < 5).sort((left, right) => right.accuracy - left.accuracy)[0];
  if (ready) {
    return {
      kind: "level_up",
      title: `Try Level ${ready.levelUnlocked} in ${ready.topicName}`,
      reason: `${Math.round(ready.accuracy)}% accuracy means you are ready for harder problems.`,
      minutes: 20,
      link: `/problem-lab?topic=${ready.topicId}&level=${ready.levelUnlocked}`,
      topicId: ready.topicId
    };
  }
  return {
    kind: "challenge",
    title: challengeDone ? "Explore a new chapter" : "Take today's Daily Challenge",
    reason: challengeDone ? "Everything is on track. Start something new from the NCERT hub." : "Five quick questions earn XP and Stars and keep your streak alive.",
    minutes: 10,
    link: challengeDone ? "/ncert" : "/challenges",
    topicId: null
  };
}

export function summarizeProgress(progress: TopicProgressDoc, topicName: string, subjectName: string, lastPracticedAt: Date | null): TopicSummary {
  let mainMistake: MistakeType | null = null;
  let best = 0;
  for (const [type, count] of Object.entries(progress.mistakeCounts ?? {})) {
    if ((count ?? 0) > best) {
      best = count ?? 0;
      mainMistake = type as MistakeType;
    }
  }
  return { topicId: progress.topicId, topicName, subjectName, accuracy: progress.accuracy, attempts: progress.attempts, mainMistake, levelUnlocked: progress.levelUnlocked, lastPracticedAt };
}
