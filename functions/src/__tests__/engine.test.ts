import { describe, expect, it, vi } from "vitest";

vi.mock("../lib/admin.js", () => {
  let counter = 0;
  const doc = (path: string) => ({ path, id: path.split("/").pop() });
  return {
    db: {
      doc,
      collection: (path: string) => ({ doc: () => doc(`${path}/auto${(counter += 1)}`) })
    }
  };
});

import { applyOutcome, type UserContext } from "../lib/engine.js";
import type { RewardConfig } from "../types.js";

const config: RewardConfig = {
  moduleXp: 50,
  quizXpPerQuestion: 10,
  quizStarsPerCorrect: 1,
  problemXpByLevel: { "1": 20 },
  problemStarsByLevel: { "1": 1 },
  challengeXp: 80,
  challengeStars: 10,
  revisionXp: 25,
  studyMinuteXp: 1,
  streakDayMinutes: 20,
  streakDayQuestions: 10,
  unlockThresholds: [80, 75, 70, 70],
  spinCooldownHours: 24,
  spinOutcomes: [],
  aiDailyLimit: 40,
  doubtCooldownSec: 120,
  answerCooldownSec: 30,
  streakMilestones: [1, 7, 30, 50, 100]
};

function fakeTxn() {
  const writes: { op: string; path: string; data: Record<string, unknown> }[] = [];
  return {
    writes,
    set: (ref: { path: string }, data: Record<string, unknown>) => writes.push({ op: "set", path: ref.path, data }),
    update: (ref: { path: string }, data: Record<string, unknown>) => writes.push({ op: "update", path: ref.path, data })
  };
}

function context(overrides: Partial<UserContext> = {}): UserContext {
  return {
    uid: "u1",
    now: new Date("2026-09-18T05:00:00Z"),
    today: "2026-09-18",
    config,
    userRef: { path: "users/u1" } as UserContext["userRef"],
    user: {
      uid: "u1", email: "", name: "", classLevel: 10, board: "CBSE", stream: null, language: "en", subjects: [], goal: "board", role: "student",
      xp: 0, stars: 0, questionsSolved: 0, modulesCompleted: 0, problemsSolved: 0, revisionsCompleted: 0, badgeIds: [], createdAt: null, updatedAt: null
    },
    streakRef: { path: "streaks/u1" } as UserContext["streakRef"],
    streak: { current: 3, longest: 3, lastQualifiedDate: "2026-09-17", milestonesAwarded: [1] },
    activityRef: { path: "dailyActivity/u1_2026-09-18" } as UserContext["activityRef"],
    activity: { minutes: 0, questions: 0, modules: 0, revisions: 0, qualified: false },
    eventRef: { path: "processedEvents/e1" } as UserContext["eventRef"],
    eventDone: false,
    ...overrides
  };
}

describe("applyOutcome", () => {
  it("writes ledger entries, marks the event, and advances the streak on a qualifying action", () => {
    const txn = fakeTxn();
    const result = applyOutcome(txn as never, context(), {
      eventId: "e1", reason: "module_completed", refId: "m1", xp: 50, stars: 0, activity: { modules: 1 }, stats: { modulesCompleted: 1 }
    });
    expect(result.streak).toMatchObject({ current: 4, incremented: true, qualifiedToday: true });
    expect(result.badges).toEqual(["first_module"]);
    const paths = txn.writes.map((write) => write.path);
    expect(paths).toContain("processedEvents/e1");
    expect(paths).toContain("xpTransactions/e1");
    expect(paths).not.toContain("starsTransactions/e1");
    expect(paths).toContain("userBadges/u1/badges/first_module");
  });

  it("does not advance the streak twice on the same day", () => {
    const txn = fakeTxn();
    const result = applyOutcome(txn as never, context({ activity: { minutes: 25, questions: 0, modules: 0, revisions: 0, qualified: true }, streak: { current: 4, longest: 4, lastQualifiedDate: "2026-09-18", milestonesAwarded: [1] } }), {
      eventId: "e2", reason: "study_session", refId: "t", xp: 5, stars: 0, activity: { minutes: 5 }
    });
    expect(result.streak).toMatchObject({ current: 4, incremented: false });
  });

  it("does not qualify the day for a non-meaningful amount of activity", () => {
    const txn = fakeTxn();
    const result = applyOutcome(txn as never, context(), { eventId: "e3", reason: "study_session", refId: "t", xp: 5, stars: 0, activity: { minutes: 5 } });
    expect(result.streak.qualifiedToday).toBe(false);
    expect(result.streak.current).toBe(3);
  });

  it("records a negative stars ledger entry for a claim", () => {
    const txn = fakeTxn();
    applyOutcome(txn as never, context({ user: { ...context().user, stars: 100 } }), { eventId: "c1", reason: "reward_claim", refId: "r1", xp: 0, stars: -60 });
    const ledger = txn.writes.find((write) => write.path === "starsTransactions/c1");
    expect(ledger?.data.amount).toBe(-60);
  });

  it("creates the 100-day goodie claim exactly when the milestone is reached", () => {
    const txn = fakeTxn();
    const result = applyOutcome(txn as never, context({ streak: { current: 99, longest: 99, lastQualifiedDate: "2026-09-17", milestonesAwarded: [1, 7, 30, 50] } }), {
      eventId: "e4", reason: "module_completed", refId: "m", xp: 50, stars: 0, activity: { modules: 1 }, stats: { modulesCompleted: 1 }
    });
    expect(result.streak.milestones).toEqual([100]);
    expect(txn.writes.map((write) => write.path)).toContain("rewardClaims/goodie100_u1");
  });
});
