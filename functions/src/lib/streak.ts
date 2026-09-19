import { daysBetween } from "./time.js";

export interface StreakState {
  current: number;
  longest: number;
  lastQualifiedDate: string | null;
}

export interface ActivityCounts {
  minutes: number;
  questions: number;
  modules: number;
  revisions: number;
}

export interface StreakThresholds {
  streakDayMinutes: number;
  streakDayQuestions: number;
}

/** A day counts only for meaningful learning, never for logging in. */
export function activityQualifies(activity: ActivityCounts, thresholds: StreakThresholds): boolean {
  return (
    activity.minutes >= thresholds.streakDayMinutes ||
    activity.questions >= thresholds.streakDayQuestions ||
    activity.modules >= 1 ||
    activity.revisions >= 1
  );
}

/**
 * Advance the streak for a day that has just qualified.
 * Same day: unchanged. Next day: +1. Gap or first ever: reset to 1.
 */
export function advanceStreak(prev: StreakState, today: string): StreakState & { incremented: boolean } {
  if (prev.lastQualifiedDate === today) {
    return { ...prev, incremented: false };
  }
  const gap = prev.lastQualifiedDate ? daysBetween(prev.lastQualifiedDate, today) : Infinity;
  const current = gap === 1 ? prev.current + 1 : 1;
  return {
    current,
    longest: Math.max(prev.longest, current),
    lastQualifiedDate: today,
    incremented: true
  };
}

/** Streak as it should be displayed today: a missed day shows 0 even before any new activity. */
export function effectiveStreak(prev: StreakState, today: string): number {
  if (!prev.lastQualifiedDate) return 0;
  const gap = daysBetween(prev.lastQualifiedDate, today);
  return gap <= 1 ? prev.current : 0;
}

export function newMilestones(current: number, milestones: number[], awarded: number[]): number[] {
  return milestones.filter((milestone) => current >= milestone && !awarded.includes(milestone));
}
