import { describe, expect, it } from "vitest";
import { daysBetween, istDate } from "../lib/time.js";
import { activityQualifies, advanceStreak, effectiveStreak, newMilestones } from "../lib/streak.js";
import { levelUnlockFor, nextAdaptive } from "../lib/adaptive.js";
import { classifyMistake, isCorrectAnswer } from "../lib/mistakes.js";
import { canSpin, pickOutcome } from "../lib/spin.js";
import { scoreQuiz } from "../lib/quiz.js";
import { leaksFinalAnswer, validateAiText } from "../lib/aiValidate.js";
import { fallbackResponse } from "../lib/aiFallback.js";
import { badgesToAward } from "../lib/badges.js";
import { emptyTopicProgress, mergeTopicProgress } from "../lib/progress.js";
import { anonUsername, contentHash } from "../lib/hash.js";
import { pickChallengeIndex } from "../callables/challenge.js";
import type { ProblemSolutionDoc } from "../types.js";

const thresholds = { streakDayMinutes: 20, streakDayQuestions: 10 };

describe("time", () => {
  it("uses the IST calendar date, not UTC", () => {
    // 20:00 UTC on 1 Jan is 01:30 IST on 2 Jan
    expect(istDate(new Date("2026-01-01T20:00:00Z"))).toBe("2026-01-02");
    expect(istDate(new Date("2026-01-01T18:00:00Z"))).toBe("2026-01-01");
  });
  it("counts whole days", () => {
    expect(daysBetween("2026-02-28", "2026-03-01")).toBe(1);
    expect(daysBetween("2026-01-01", "2026-01-01")).toBe(0);
  });
});

describe("streak", () => {
  it("does not qualify on login alone", () => {
    expect(activityQualifies({ minutes: 0, questions: 0, modules: 0, revisions: 0 }, thresholds)).toBe(false);
  });
  it("qualifies on any one meaningful threshold", () => {
    expect(activityQualifies({ minutes: 20, questions: 0, modules: 0, revisions: 0 }, thresholds)).toBe(true);
    expect(activityQualifies({ minutes: 0, questions: 10, modules: 0, revisions: 0 }, thresholds)).toBe(true);
    expect(activityQualifies({ minutes: 0, questions: 0, modules: 1, revisions: 0 }, thresholds)).toBe(true);
    expect(activityQualifies({ minutes: 0, questions: 0, modules: 0, revisions: 1 }, thresholds)).toBe(true);
    expect(activityQualifies({ minutes: 19, questions: 9, modules: 0, revisions: 0 }, thresholds)).toBe(false);
  });
  it("increments on consecutive days, ignores same day, resets after a gap", () => {
    const first = advanceStreak({ current: 0, longest: 0, lastQualifiedDate: null }, "2026-09-01");
    expect(first).toMatchObject({ current: 1, longest: 1, incremented: true });
    const sameDay = advanceStreak(first, "2026-09-01");
    expect(sameDay).toMatchObject({ current: 1, incremented: false });
    const nextDay = advanceStreak(first, "2026-09-02");
    expect(nextDay).toMatchObject({ current: 2, longest: 2, incremented: true });
    const afterGap = advanceStreak(nextDay, "2026-09-05");
    expect(afterGap).toMatchObject({ current: 1, longest: 2, incremented: true });
  });
  it("shows zero once a day is missed", () => {
    const state = { current: 5, longest: 5, lastQualifiedDate: "2026-09-01" };
    expect(effectiveStreak(state, "2026-09-02")).toBe(5);
    expect(effectiveStreak(state, "2026-09-03")).toBe(0);
  });
  it("awards each milestone once", () => {
    expect(newMilestones(7, [1, 7, 30], [1])).toEqual([7]);
    expect(newMilestones(7, [1, 7, 30], [1, 7])).toEqual([]);
  });
});

describe("adaptive difficulty", () => {
  it("steps up after two correct and down after two wrong", () => {
    let state = { consecutiveCorrect: 0, consecutiveWrong: 0, suggestedLevel: 2 as const };
    state = nextAdaptive(state, true, 3) as typeof state;
    expect(state.suggestedLevel).toBe(2);
    state = nextAdaptive(state, true, 3) as typeof state;
    expect(state.suggestedLevel).toBe(3);
    state = nextAdaptive(state, false, 3) as typeof state;
    state = nextAdaptive(state, false, 3) as typeof state;
    expect(state.suggestedLevel).toBe(2);
  });
  it("never suggests above the unlocked level or below 1", () => {
    const capped = nextAdaptive(nextAdaptive({ consecutiveCorrect: 0, consecutiveWrong: 0, suggestedLevel: 1 }, true, 1), true, 1);
    expect(capped.suggestedLevel).toBe(1);
    const floor = nextAdaptive(nextAdaptive({ consecutiveCorrect: 0, consecutiveWrong: 0, suggestedLevel: 1 }, false, 1), false, 1);
    expect(floor.suggestedLevel).toBe(1);
  });
  it("unlocks levels at 80/75/70/70 with at least three attempts", () => {
    const thresholdsList = [80, 75, 70, 70];
    expect(levelUnlockFor({}, thresholdsList)).toBe(1);
    expect(levelUnlockFor({ "1": { attempts: 2, correct: 2 } }, thresholdsList)).toBe(1);
    expect(levelUnlockFor({ "1": { attempts: 5, correct: 4 } }, thresholdsList)).toBe(2);
    expect(levelUnlockFor({ "1": { attempts: 5, correct: 3 } }, thresholdsList)).toBe(1);
    expect(levelUnlockFor({ "1": { attempts: 5, correct: 5 }, "2": { attempts: 4, correct: 3 } }, thresholdsList)).toBe(3);
  });
});

const solution: ProblemSolutionDoc = {
  id: "p1",
  finalAnswer: "20 m/s",
  numericAnswer: 20,
  tolerance: 0.01,
  acceptedAnswers: ["20 m/s", "20"],
  steps: [
    { label: "Given", content: "u = 10 m/s, a = 2 m/s^2, t = 5 s" },
    { label: "Concept", content: "equations of motion, uniform acceleration" },
    { label: "Formula", content: "v = u + at" }
  ],
  commonMistakes: [{ type: "formula", description: "Used s = ut + 1/2 at^2", matchAnswers: ["75"] }],
  coach: { hint: "h", concept: "c", guide: "g", checkApproach: "ca", findMistake: "fm", fullExplanation: "fe" }
};

describe("problem checking and mistake classification", () => {
  it("accepts numeric answers within tolerance and listed text answers", () => {
    expect(isCorrectAnswer(solution, "20")).toBe(true);
    expect(isCorrectAnswer(solution, " 20.0 m/s ")).toBe(true);
    expect(isCorrectAnswer(solution, "19")).toBe(false);
  });
  it("uses author-listed wrong answers first", () => {
    expect(classifyMistake(solution, { finalAnswer: "75", steps: {}, timeSpentSec: 60, expectedMinutes: 3 })).toBe("formula");
  });
  it("detects sign errors", () => {
    expect(classifyMistake(solution, { finalAnswer: "-20", steps: {}, timeSpentSec: 60, expectedMinutes: 3 })).toBe("sign");
  });
  it("calls it a calculation error when concept and formula were right", () => {
    const steps = { concept: "equations of motion", formula: "v = u + at" };
    expect(classifyMistake(solution, { finalAnswer: "25", steps, timeSpentSec: 60, expectedMinutes: 3 })).toBe("calculation");
  });
  it("falls back to concept error", () => {
    expect(classifyMistake(solution, { finalAnswer: "abc", steps: {}, timeSpentSec: 60, expectedMinutes: 3 })).toBe("concept");
  });
  it("flags time management on a blank answer far over time", () => {
    expect(classifyMistake(solution, { finalAnswer: "?", steps: {}, timeSpentSec: 900, expectedMinutes: 3 })).toBe("time");
  });
});

describe("spin wheel", () => {
  const outcomes = [
    { label: "A", weight: 50, xp: 0, stars: 10, badgeId: null },
    { label: "B", weight: 50, xp: 100, stars: 0, badgeId: null }
  ];
  it("respects the cooldown", () => {
    expect(canSpin(null, 1000)).toBe(true);
    expect(canSpin(2000, 1000)).toBe(false);
    expect(canSpin(2000, 2000)).toBe(true);
  });
  it("picks by weight deterministically", () => {
    expect(pickOutcome(outcomes, 0.1).label).toBe("A");
    expect(pickOutcome(outcomes, 0.9).label).toBe("B");
    expect(pickOutcome(outcomes, 0.999999).label).toBe("B");
  });
});

describe("quiz scoring", () => {
  it("scores only against server keys and treats missing answers as wrong", () => {
    const keys = new Map([
      ["q1", { id: "q1", correctIndex: 2, explanation: "e1" }],
      ["q2", { id: "q2", correctIndex: 0, explanation: "e2" }]
    ]);
    const scored = scoreQuiz(["q1", "q2"], { q1: 2, q3: 1 }, keys);
    expect(scored.score).toBe(1);
    expect(scored.total).toBe(2);
    expect(scored.results.q2.correct).toBe(false);
  });
});

describe("AI validation and fallback", () => {
  it("rejects empty, short and unsafe output and caps long output", () => {
    expect(validateAiText("").ok).toBe(false);
    expect(validateAiText("hi").reason).toBe("too_short");
    expect(validateAiText("Here is my api_key: abc").reason).toBe("unsafe");
    const long = validateAiText("x".repeat(5000));
    expect(long.ok).toBe(true);
    expect(long.text.length).toBeLessThan(4100);
  });
  it("detects answer leaks in learning mode", () => {
    expect(leaksFinalAnswer("So v equals 20 m/s finally.", ["20 m/s"])).toBe(true);
    expect(leaksFinalAnswer("Use v = u + at.", ["20 m/s"])).toBe(false);
  });
  it("holds back the full explanation in learning mode until enough guidance", () => {
    const early = fallbackResponse({ mode: "full_explanation", solution, topic: null, problemTitle: null, learningMode: true, guidanceTurns: 0 });
    expect(early).toContain("Learning Mode");
    const later = fallbackResponse({ mode: "full_explanation", solution, topic: null, problemTitle: null, learningMode: true, guidanceTurns: 3 });
    expect(later).toBe("fe");
  });
  it("returns null when no authored content exists", () => {
    expect(fallbackResponse({ mode: "exam", solution: null, topic: null, problemTitle: null, learningMode: false, guidanceTurns: 0 })).toBeNull();
  });
});

describe("badges and progress", () => {
  it("never awards a badge twice", () => {
    const stats = { modulesCompleted: 1, problemsSolved: 10, questionsSolved: 0, streakCurrent: 7, revisionsCompleted: 0 };
    expect(badgesToAward(stats, [])).toEqual(["first_module", "problems_10", "streak_7"]);
    expect(badgesToAward(stats, ["first_module", "problems_10", "streak_7"])).toEqual([]);
  });
  it("merges attempts, unlocks levels and dedupes solved ids", () => {
    let progress = emptyTopicProgress("t", "c", "mathematics", 10);
    for (let index = 0; index < 4; index += 1) {
      progress = mergeTopicProgress(progress, { level: 1, attempts: 1, correct: 1, solvedProblemId: `p${index}` }, [80, 75, 70, 70]);
    }
    expect(progress.levelUnlocked).toBe(2);
    expect(progress.accuracy).toBe(100);
    progress = mergeTopicProgress(progress, { level: 1, attempts: 1, correct: 1, solvedProblemId: "p0" }, [80, 75, 70, 70]);
    expect(progress.solvedProblemIds).toHaveLength(4);
    progress = mergeTopicProgress(progress, { level: 2, attempts: 1, correct: 0, mistakeType: "unit" }, [80, 75, 70, 70]);
    expect(progress.mistakeCounts.unit).toBe(1);
  });
});

describe("hash helpers and challenge rotation", () => {
  it("hashes ignoring case, punctuation and spacing", () => {
    expect(contentHash("Why is  v = u + at?")).toBe(contentHash("why is v=u+at"));
  });
  it("derives a stable anonymous name without leaking the uid", () => {
    expect(anonUsername("abc")).toBe(anonUsername("abc"));
    expect(anonUsername("abc")).not.toContain("abc");
  });
  it("rotates the daily challenge deterministically", () => {
    expect(pickChallengeIndex("2026-01-01", 3)).toBe(0);
    expect(pickChallengeIndex("2026-01-02", 3)).toBe(1);
    expect(pickChallengeIndex("2026-01-04", 3)).toBe(0);
  });
});
