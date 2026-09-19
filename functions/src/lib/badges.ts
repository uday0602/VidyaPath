export interface BadgeStats {
  modulesCompleted: number;
  problemsSolved: number;
  questionsSolved: number;
  streakCurrent: number;
  revisionsCompleted: number;
}

interface BadgeRule {
  id: string;
  earned: (stats: BadgeStats) => boolean;
}

export const BADGE_RULES: BadgeRule[] = [
  { id: "first_module", earned: (stats) => stats.modulesCompleted >= 1 },
  { id: "problems_10", earned: (stats) => stats.problemsSolved >= 10 },
  { id: "questions_100", earned: (stats) => stats.questionsSolved >= 100 },
  { id: "streak_7", earned: (stats) => stats.streakCurrent >= 7 },
  { id: "streak_30", earned: (stats) => stats.streakCurrent >= 30 },
  { id: "streak_100", earned: (stats) => stats.streakCurrent >= 100 },
  { id: "problem_solver", earned: (stats) => stats.problemsSolved >= 25 },
  { id: "revision_master", earned: (stats) => stats.revisionsCompleted >= 10 }
];

/** Badges newly earned given current stats. Already-awarded ids are skipped so a badge is never granted twice. */
export function badgesToAward(stats: BadgeStats, alreadyAwarded: string[]): string[] {
  return BADGE_RULES.filter((rule) => !alreadyAwarded.includes(rule.id) && rule.earned(stats)).map((rule) => rule.id);
}
