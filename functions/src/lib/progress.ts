import type { ClassLevel, Level, MistakeType, SubjectId, TopicProgressDoc } from "../types.js";
import { accuracyOf, levelUnlockFor, nextAdaptive } from "./adaptive.js";

export interface ProgressEvent {
  level: Level;
  attempts: number;
  correct: number;
  mistakeType?: MistakeType | null;
  solvedProblemId?: string;
  revealedProblemId?: string;
}

export function emptyTopicProgress(topicId: string, chapterId: string, subjectId: SubjectId, classLevel: ClassLevel): TopicProgressDoc {
  return {
    topicId,
    chapterId,
    subjectId,
    classLevel,
    levelUnlocked: 1,
    attempts: 0,
    correct: 0,
    accuracy: 0,
    solvedProblemIds: [],
    revealedProblemIds: [],
    levelStats: {},
    adaptive: { consecutiveCorrect: 0, consecutiveWrong: 0, suggestedLevel: 1 },
    mistakeCounts: {},
    mastery: 0,
    lastPracticedAt: null
  };
}

/** Pure merge of one practice event into a topic's progress. */
export function mergeTopicProgress(prev: TopicProgressDoc, event: ProgressEvent, unlockThresholds: number[]): TopicProgressDoc {
  const levelKey = String(event.level);
  const levelEntry = prev.levelStats[levelKey] ?? { attempts: 0, correct: 0 };
  const levelStats = {
    ...prev.levelStats,
    [levelKey]: { attempts: levelEntry.attempts + event.attempts, correct: levelEntry.correct + event.correct }
  };
  const attempts = prev.attempts + event.attempts;
  const correct = prev.correct + event.correct;
  const levelUnlocked = Math.max(prev.levelUnlocked, levelUnlockFor(levelStats, unlockThresholds)) as Level;
  const mistakeCounts = { ...prev.mistakeCounts };
  if (event.mistakeType) mistakeCounts[event.mistakeType] = (mistakeCounts[event.mistakeType] ?? 0) + 1;
  const solvedProblemIds =
    event.solvedProblemId && !prev.solvedProblemIds.includes(event.solvedProblemId)
      ? [...prev.solvedProblemIds, event.solvedProblemId]
      : prev.solvedProblemIds;
  const revealedProblemIds =
    event.revealedProblemId && !prev.revealedProblemIds.includes(event.revealedProblemId)
      ? [...prev.revealedProblemIds, event.revealedProblemId]
      : prev.revealedProblemIds;
  const adaptive =
    event.attempts === 1
      ? nextAdaptive(prev.adaptive, event.correct === 1, levelUnlocked)
      : { ...prev.adaptive, suggestedLevel: Math.min(prev.adaptive.suggestedLevel, levelUnlocked) as Level };
  const accuracy = accuracyOf(correct, attempts);
  return {
    ...prev,
    levelStats,
    attempts,
    correct,
    accuracy,
    levelUnlocked,
    mistakeCounts,
    solvedProblemIds,
    revealedProblemIds,
    adaptive,
    mastery: Math.round(((levelUnlocked - 1) * 20 + accuracy * 0.2) * 10) / 10
  };
}

export function dominantMistake(counts: Partial<Record<MistakeType, number>>): MistakeType | null {
  let best: MistakeType | null = null;
  let bestCount = 0;
  for (const [type, count] of Object.entries(counts) as [MistakeType, number][]) {
    if (count > bestCount) {
      best = type;
      bestCount = count;
    }
  }
  return best;
}
