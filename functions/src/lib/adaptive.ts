import type { Level } from "../types.js";

export interface AdaptiveState {
  consecutiveCorrect: number;
  consecutiveWrong: number;
  suggestedLevel: Level;
}

export type LevelStats = Record<string, { attempts: number; correct: number }>;

const MIN_ATTEMPTS_FOR_UNLOCK = 3;

/** Deterministic difficulty steering: two in a row up, two in a row down. */
export function nextAdaptive(prev: AdaptiveState, correct: boolean, levelUnlocked: Level): AdaptiveState {
  const consecutiveCorrect = correct ? prev.consecutiveCorrect + 1 : 0;
  const consecutiveWrong = correct ? 0 : prev.consecutiveWrong + 1;
  let suggestedLevel = prev.suggestedLevel;
  if (consecutiveCorrect >= 2 && suggestedLevel < levelUnlocked) {
    suggestedLevel = (suggestedLevel + 1) as Level;
    return { consecutiveCorrect: 0, consecutiveWrong, suggestedLevel };
  }
  if (consecutiveWrong >= 2 && suggestedLevel > 1) {
    suggestedLevel = (suggestedLevel - 1) as Level;
    return { consecutiveCorrect, consecutiveWrong: 0, suggestedLevel };
  }
  return { consecutiveCorrect, consecutiveWrong, suggestedLevel };
}

/**
 * Highest level the student has unlocked. Level N+1 opens when accuracy at level N
 * meets thresholds[N-1] (80/75/70/70 by default) over at least 3 attempts.
 */
export function levelUnlockFor(stats: LevelStats, thresholds: number[]): Level {
  let unlocked: Level = 1;
  for (let level = 1; level <= 4; level += 1) {
    const entry = stats[String(level)];
    if (!entry || entry.attempts < MIN_ATTEMPTS_FOR_UNLOCK) break;
    const accuracy = (entry.correct / entry.attempts) * 100;
    if (accuracy < thresholds[level - 1]) break;
    unlocked = (level + 1) as Level;
  }
  return unlocked;
}

export function accuracyOf(correct: number, attempts: number): number {
  return attempts === 0 ? 0 : Math.round((correct / attempts) * 100);
}
