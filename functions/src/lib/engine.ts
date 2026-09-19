import { FieldValue, Timestamp, type DocumentReference, type Transaction } from "firebase-admin/firestore";
import { HttpsError } from "firebase-functions/v2/https";
import { db } from "./admin.js";
import { istDate } from "./time.js";
import { activityQualifies, advanceStreak, newMilestones, type ActivityCounts, type StreakState } from "./streak.js";
import { badgesToAward, type BadgeStats } from "./badges.js";
import type { DailyActivityDoc, RewardConfig, StreakDoc, UserDoc } from "../types.js";

/** Server-only counters kept on the user doc so awarding needs no extra reads. */
export interface UserServerFields extends UserDoc {
  badgeIds: string[];
  problemsSolved: number;
  revisionsCompleted: number;
}

export interface UserContext {
  uid: string;
  now: Date;
  today: string;
  config: RewardConfig;
  userRef: DocumentReference;
  user: UserServerFields;
  streakRef: DocumentReference;
  streak: StreakState & { milestonesAwarded: number[] };
  activityRef: DocumentReference;
  activity: ActivityCounts & { qualified: boolean };
  eventRef: DocumentReference;
  eventDone: boolean;
}

export interface Outcome {
  eventId: string;
  reason: string;
  refId: string;
  xp: number;
  stars: number;
  activity?: Partial<ActivityCounts>;
  stats?: Partial<Pick<UserServerFields, "questionsSolved" | "modulesCompleted" | "problemsSolved" | "revisionsCompleted">>;
  badgeIds?: string[];
}

export interface OutcomeResult {
  xp: number;
  stars: number;
  streak: { current: number; longest: number; incremented: boolean; milestones: number[]; qualifiedToday: boolean };
  badges: string[];
}

const EMPTY_ACTIVITY = { minutes: 0, questions: 0, modules: 0, revisions: 0, qualified: false };

/**
 * All reads a value-awarding callable needs, done up front so the transaction
 * can then write. Every awarding function calls this once, then applyOutcome once.
 */
export async function readUserContext(txn: Transaction, uid: string, eventId: string, config: RewardConfig, now = new Date()): Promise<UserContext> {
  const today = istDate(now);
  const userRef = db.doc(`users/${uid}`);
  const streakRef = db.doc(`streaks/${uid}`);
  const activityRef = db.doc(`dailyActivity/${uid}_${today}`);
  const eventRef = db.doc(`processedEvents/${eventId}`);
  const [userSnap, streakSnap, activitySnap, eventSnap] = await txn.getAll(userRef, streakRef, activityRef, eventRef);
  if (!userSnap.exists) throw new HttpsError("failed-precondition", "Profile not found. Complete registration first.");
  const rawUser = userSnap.data() as Partial<UserServerFields>;
  const rawStreak = (streakSnap.data() ?? {}) as Partial<StreakDoc>;
  const rawActivity = (activitySnap.data() ?? {}) as Partial<DailyActivityDoc>;
  return {
    uid,
    now,
    today,
    config,
    userRef,
    user: {
      ...(rawUser as UserServerFields),
      xp: rawUser.xp ?? 0,
      stars: rawUser.stars ?? 0,
      badgeIds: rawUser.badgeIds ?? [],
      questionsSolved: rawUser.questionsSolved ?? 0,
      modulesCompleted: rawUser.modulesCompleted ?? 0,
      problemsSolved: rawUser.problemsSolved ?? 0,
      revisionsCompleted: rawUser.revisionsCompleted ?? 0
    },
    streakRef,
    streak: {
      current: rawStreak.current ?? 0,
      longest: rawStreak.longest ?? 0,
      lastQualifiedDate: rawStreak.lastQualifiedDate ?? null,
      milestonesAwarded: rawStreak.milestonesAwarded ?? []
    },
    activityRef,
    activity: { ...EMPTY_ACTIVITY, ...rawActivity },
    eventRef,
    eventDone: eventSnap.exists
  };
}

/**
 * Write the ledger, balances, daily activity, streak, badges and public summary for one event.
 * Idempotent: the caller must have checked ctx.eventDone before computing rewards.
 */
export function applyOutcome(txn: Transaction, ctx: UserContext, outcome: Outcome): OutcomeResult {
  const { uid, today, config } = ctx;
  const serverNow = FieldValue.serverTimestamp();
  const activity = {
    minutes: ctx.activity.minutes + (outcome.activity?.minutes ?? 0),
    questions: ctx.activity.questions + (outcome.activity?.questions ?? 0),
    modules: ctx.activity.modules + (outcome.activity?.modules ?? 0),
    revisions: ctx.activity.revisions + (outcome.activity?.revisions ?? 0)
  };
  const qualifiedNow = activityQualifies(activity, config);
  let streakResult: StreakState & { incremented: boolean } = { ...ctx.streak, incremented: false };
  let milestones: number[] = [];
  if (qualifiedNow && !ctx.activity.qualified) {
    streakResult = advanceStreak(ctx.streak, today);
    milestones = newMilestones(streakResult.current, config.streakMilestones, ctx.streak.milestonesAwarded);
  }

  const stats = {
    questionsSolved: ctx.user.questionsSolved + (outcome.stats?.questionsSolved ?? 0),
    modulesCompleted: ctx.user.modulesCompleted + (outcome.stats?.modulesCompleted ?? 0),
    problemsSolved: ctx.user.problemsSolved + (outcome.stats?.problemsSolved ?? 0),
    revisionsCompleted: ctx.user.revisionsCompleted + (outcome.stats?.revisionsCompleted ?? 0)
  };
  const badgeStats: BadgeStats = { ...stats, streakCurrent: streakResult.current };
  const badges = [...badgesToAward(badgeStats, ctx.user.badgeIds), ...(outcome.badgeIds ?? [])].filter(
    (badgeId, index, all) => !ctx.user.badgeIds.includes(badgeId) && all.indexOf(badgeId) === index
  );

  txn.set(ctx.eventRef, { userId: uid, reason: outcome.reason, refId: outcome.refId, createdAt: serverNow });
  if (outcome.xp > 0) {
    txn.set(db.doc(`xpTransactions/${outcome.eventId}`), { id: outcome.eventId, userId: uid, amount: outcome.xp, reason: outcome.reason, refId: outcome.refId, createdAt: serverNow });
  }
  if (outcome.stars !== 0) {
    txn.set(db.doc(`starsTransactions/${outcome.eventId}`), { id: outcome.eventId, userId: uid, amount: outcome.stars, reason: outcome.reason, refId: outcome.refId, createdAt: serverNow });
  }
  txn.update(ctx.userRef, {
    xp: FieldValue.increment(outcome.xp),
    stars: FieldValue.increment(outcome.stars),
    ...stats,
    ...(badges.length ? { badgeIds: FieldValue.arrayUnion(...badges) } : {}),
    updatedAt: serverNow
  });

  txn.set(ctx.activityRef, { uid, date: today, ...activity, qualified: qualifiedNow, updatedAt: serverNow }, { merge: true });
  txn.set(
    ctx.streakRef,
    {
      uid,
      current: streakResult.current,
      longest: streakResult.longest,
      lastQualifiedDate: streakResult.lastQualifiedDate,
      ...(milestones.length ? { milestonesAwarded: FieldValue.arrayUnion(...milestones) } : {}),
      updatedAt: serverNow
    },
    { merge: true }
  );

  for (const badgeId of badges) {
    txn.set(db.doc(`userBadges/${uid}/badges/${badgeId}`), { badgeId, awardedAt: serverNow });
  }
  for (const milestone of milestones) {
    addNotification(txn, uid, "streak", `${milestone}-day streak!`, `You kept a ${milestone}-day learning streak. Keep going.`, "/rewards");
    if (milestone === 100) {
      const claimId = `goodie100_${uid}`;
      txn.set(db.doc(`rewardClaims/${claimId}`), {
        id: claimId,
        userId: uid,
        rewardId: "goodie100",
        rewardName: "100-Day Streak Goodie (Demo Fulfillment)",
        starsSpent: 0,
        type: "goodie100",
        status: "pending",
        createdAt: serverNow
      });
    }
  }

  const questionsSolved = stats.questionsSolved;
  txn.set(
    db.doc(`publicProfiles/${uid}`),
    { progressSummary: { questionsSolved, modulesCompleted: stats.modulesCompleted }, updatedAt: serverNow },
    { merge: true }
  );

  return {
    xp: outcome.xp,
    stars: outcome.stars,
    streak: { current: streakResult.current, longest: streakResult.longest, incremented: streakResult.incremented, milestones, qualifiedToday: qualifiedNow },
    badges
  };
}

export function addNotification(txn: Transaction, uid: string, type: string, title: string, body: string, link: string | null): void {
  const ref = db.collection(`notifications/${uid}/items`).doc();
  txn.set(ref, { id: ref.id, type, title, body, link, read: false, createdAt: FieldValue.serverTimestamp() });
}

export function toMillis(value: unknown): number | null {
  if (value instanceof Timestamp) return value.toMillis();
  if (value instanceof Date) return value.getTime();
  return null;
}
