import { initializeApp, getApps } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { getAuth } from "firebase-admin/auth";
import { HttpsError, type CallableRequest } from "firebase-functions/v2/https";
import type { RewardConfig } from "../types.js";

if (getApps().length === 0) initializeApp();

export const db = getFirestore();
export const auth = getAuth();

export function requireUid(request: CallableRequest<unknown>): string {
  if (!request.auth?.uid) throw new HttpsError("unauthenticated", "Sign in to continue.");
  return request.auth.uid;
}

export function requireAdmin(request: CallableRequest<unknown>): string {
  const uid = requireUid(request);
  if (request.auth?.token.admin !== true) throw new HttpsError("permission-denied", "Admin access required.");
  return uid;
}

export function requireString(value: unknown, field: string, maxLength = 200): string {
  if (typeof value !== "string" || value.trim().length === 0 || value.length > maxLength) {
    throw new HttpsError("invalid-argument", `Invalid ${field}.`);
  }
  return value.trim();
}

export function requireNumber(value: unknown, field: string, min: number, max: number): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < min || value > max) {
    throw new HttpsError("invalid-argument", `Invalid ${field}.`);
  }
  return value;
}

export const DEFAULT_CONFIG: RewardConfig = {
  moduleXp: 50,
  quizXpPerQuestion: 10,
  quizStarsPerCorrect: 1,
  problemXpByLevel: { "1": 20, "2": 35, "3": 50, "4": 75, "5": 100 },
  problemStarsByLevel: { "1": 1, "2": 2, "3": 3, "4": 5, "5": 8 },
  challengeXp: 80,
  challengeStars: 10,
  revisionXp: 25,
  studyMinuteXp: 1,
  streakDayMinutes: 20,
  streakDayQuestions: 10,
  unlockThresholds: [80, 75, 70, 70],
  spinCooldownHours: 24,
  spinOutcomes: [
    { label: "+10 Stars", weight: 30, xp: 0, stars: 10, badgeId: null },
    { label: "+25 Stars", weight: 20, xp: 0, stars: 25, badgeId: null },
    { label: "+50 Stars", weight: 8, xp: 0, stars: 50, badgeId: null },
    { label: "+100 XP", weight: 20, xp: 100, stars: 0, badgeId: null },
    { label: "Lucky Badge", weight: 7, xp: 0, stars: 0, badgeId: "lucky_spin" },
    { label: "Try Again", weight: 15, xp: 0, stars: 0, badgeId: null }
  ],
  aiDailyLimit: 40,
  doubtCooldownSec: 120,
  answerCooldownSec: 30,
  streakMilestones: [1, 7, 30, 50, 100]
};

let cachedConfig: { value: RewardConfig; loadedAt: number } | null = null;
const CONFIG_TTL_MS = 60_000;

/** Reward values live in appConfig/rewards so admins can tune them without a deploy. */
export async function loadConfig(): Promise<RewardConfig> {
  if (cachedConfig && Date.now() - cachedConfig.loadedAt < CONFIG_TTL_MS) return cachedConfig.value;
  const snap = await db.doc("appConfig/rewards").get();
  const value = { ...DEFAULT_CONFIG, ...(snap.exists ? (snap.data() as Partial<RewardConfig>) : {}) };
  cachedConfig = { value, loadedAt: Date.now() };
  return value;
}
