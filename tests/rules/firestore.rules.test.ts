import { readFileSync } from "node:fs";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { assertFails, assertSucceeds, initializeTestEnvironment, type RulesTestEnvironment } from "@firebase/rules-unit-testing";
import { doc, getDoc, setDoc, updateDoc, serverTimestamp, collection, query, where, getDocs } from "firebase/firestore";

// Security tests for spec section 54: every "a normal student cannot" case.
// Requires the Firestore emulator: firebase emulators:exec --only firestore "npm run test:rules"

let env: RulesTestEnvironment;
const STUDENT = "student_a";
const OTHER = "student_b";
const ADMIN = "admin_1";

function studentProfile(uid: string, email: string) {
  return {
    uid, email, name: "Test", classLevel: 10, board: "CBSE", stream: null, language: "en", subjects: ["mathematics"], goal: "board",
    role: "student", xp: 0, stars: 0, questionsSolved: 0, modulesCompleted: 0, createdAt: serverTimestamp(), updatedAt: serverTimestamp()
  };
}

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: "vidyapath-rules-test",
    firestore: { rules: readFileSync("firestore.rules", "utf8"), host: "127.0.0.1", port: 8080 }
  });
});

afterAll(async () => {
  await env.cleanup();
});

beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    await setDoc(doc(db, `users/${STUDENT}`), { ...studentProfile(STUDENT, "a@test.dev"), xp: 100, stars: 50 });
    await setDoc(doc(db, `users/${OTHER}`), { ...studentProfile(OTHER, "b@test.dev"), xp: 100, stars: 50 });
    await setDoc(doc(db, `streaks/${STUDENT}`), { uid: STUDENT, current: 3, longest: 3, lastQualifiedDate: "2026-09-17", milestonesAwarded: [] });
    await setDoc(doc(db, `studentProgress/${OTHER}/topics/t1`), { topicId: "t1", accuracy: 50 });
    await setDoc(doc(db, `rewards/r1`), { id: "r1", name: "Notebook", starsRequired: 100, available: true });
    await setDoc(doc(db, `rewardClaims/c1`), { id: "c1", userId: OTHER, rewardId: "r1", status: "pending" });
    await setDoc(doc(db, `spinState/${STUDENT}`), { uid: STUDENT, nextSpinAt: null, totalSpins: 0 });
    await setDoc(doc(db, `doubts/d1`), { id: "d1", authorId: OTHER, hidden: false, status: "open", voteCount: 0, title: "t", body: "b" });
    await setDoc(doc(db, `doubts/d1/answers/a1`), { id: "a1", doubtId: "d1", authorId: OTHER, hidden: false, voteCount: 0 });
    await setDoc(doc(db, `doubts/d2`), { id: "d2", authorId: OTHER, hidden: true, status: "open", voteCount: 0, title: "t", body: "b" });
    await setDoc(doc(db, `studyTwins/p1`), { id: "p1", members: [OTHER, "someone"] });
    await setDoc(doc(db, `questionKeys/q1`), { id: "q1", correctIndex: 1, explanation: "x" });
    await setDoc(doc(db, `problemSolutions/p1`), { id: "p1", finalAnswer: "20" });
    await setDoc(doc(db, `publicProfiles/${OTHER}`), { uid: OTHER, anonUsername: "CalmOtter42", classLevel: 10 });
  });
});

const asStudent = () => env.authenticatedContext(STUDENT, { email: "a@test.dev" }).firestore();
const asAdmin = () => env.authenticatedContext(ADMIN, { admin: true }).firestore();
const asAnon = () => env.unauthenticatedContext().firestore();

describe("unauthenticated access", () => {
  it("cannot read users, content or doubts", async () => {
    await assertFails(getDoc(doc(asAnon(), `users/${STUDENT}`)));
    await assertFails(getDoc(doc(asAnon(), `topics/t1`)));
    await assertFails(getDoc(doc(asAnon(), `doubts/d1`)));
  });
});

describe("a student cannot", () => {
  it("read another student's private profile or progress", async () => {
    await assertFails(getDoc(doc(asStudent(), `users/${OTHER}`)));
    await assertFails(getDoc(doc(asStudent(), `studentProgress/${OTHER}/topics/t1`)));
  });
  it("modify Stars, XP, role or another student's data", async () => {
    await assertFails(updateDoc(doc(asStudent(), `users/${STUDENT}`), { stars: 9999, updatedAt: serverTimestamp() }));
    await assertFails(updateDoc(doc(asStudent(), `users/${STUDENT}`), { xp: 9999, updatedAt: serverTimestamp() }));
    await assertFails(updateDoc(doc(asStudent(), `users/${STUDENT}`), { role: "admin", updatedAt: serverTimestamp() }));
    await assertFails(updateDoc(doc(asStudent(), `users/${OTHER}`), { name: "Hacked", updatedAt: serverTimestamp() }));
  });
  it("modify streak, spin state or progress", async () => {
    await assertFails(updateDoc(doc(asStudent(), `streaks/${STUDENT}`), { current: 100 }));
    await assertFails(updateDoc(doc(asStudent(), `spinState/${STUDENT}`), { nextSpinAt: null }));
    await assertFails(setDoc(doc(asStudent(), `studentProgress/${STUDENT}/topics/t1`), { levelUnlocked: 5 }));
  });
  it("claim rewards, alter prices, or touch another student's claim", async () => {
    await assertFails(setDoc(doc(asStudent(), `rewardClaims/mine`), { userId: STUDENT, rewardId: "r1", status: "fulfilled" }));
    await assertFails(updateDoc(doc(asStudent(), `rewards/r1`), { starsRequired: 1 }));
    await assertFails(updateDoc(doc(asStudent(), `rewardClaims/c1`), { status: "fulfilled" }));
    await assertFails(getDoc(doc(asStudent(), `rewardClaims/c1`)));
  });
  it("write votes, spin history, ledger entries or attempts", async () => {
    await assertFails(setDoc(doc(asStudent(), `votes/${STUDENT}_a1`), { userId: STUDENT, answerId: "a1" }));
    await assertFails(updateDoc(doc(asStudent(), `doubts/d1/answers/a1`), { voteCount: 999 }));
    await assertFails(setDoc(doc(asStudent(), `spinHistory/x`), { userId: STUDENT, result: "+50 Stars" }));
    await assertFails(setDoc(doc(asStudent(), `starsTransactions/x`), { userId: STUDENT, amount: 1000 }));
    await assertFails(setDoc(doc(asStudent(), `quizAttempts/x`), { userId: STUDENT, score: 10, finalized: true }));
  });
  it("read answer keys or worked solutions", async () => {
    await assertFails(getDoc(doc(asStudent(), `questionKeys/q1`)));
    await assertFails(getDoc(doc(asStudent(), `problemSolutions/p1`)));
  });
  it("change moderation fields or read hidden content", async () => {
    await assertFails(updateDoc(doc(asStudent(), `doubts/d1`), { hidden: true }));
    await assertFails(getDoc(doc(asStudent(), `doubts/d2`)));
  });
  it("read a private workspace (study twin pair) it is not part of", async () => {
    await assertFails(getDoc(doc(asStudent(), `studyTwins/p1`)));
  });
  it("create a doubt directly, bypassing cooldown checks", async () => {
    await assertFails(setDoc(doc(asStudent(), `doubts/new`), { authorId: STUDENT, hidden: false, title: "x", body: "y" }));
  });
  it("register with a non-student role or a non-zero balance", async () => {
    const db = env.authenticatedContext("fresh", { email: "f@test.dev" }).firestore();
    await assertFails(setDoc(doc(db, "users/fresh"), { ...studentProfile("fresh", "f@test.dev"), role: "admin" }));
    await assertFails(setDoc(doc(db, "users/fresh"), { ...studentProfile("fresh", "f@test.dev"), stars: 500 }));
    await assertFails(setDoc(doc(db, "users/fresh"), { ...studentProfile("fresh", "f@test.dev"), classLevel: 13 }));
  });
});

describe("a student can", () => {
  it("register with a valid profile and edit preferences only", async () => {
    const db = env.authenticatedContext("fresh", { email: "f@test.dev" }).firestore();
    await assertSucceeds(setDoc(doc(db, "users/fresh"), studentProfile("fresh", "f@test.dev")));
    await assertSucceeds(updateDoc(doc(db, "users/fresh"), { name: "New Name", goal: "board_jee", updatedAt: serverTimestamp() }));
  });
  it("read own data and public content", async () => {
    await assertSucceeds(getDoc(doc(asStudent(), `users/${STUDENT}`)));
    await assertSucceeds(getDoc(doc(asStudent(), `streaks/${STUDENT}`)));
    await assertSucceeds(getDoc(doc(asStudent(), `rewards/r1`)));
    await assertSucceeds(getDoc(doc(asStudent(), `publicProfiles/${OTHER}`)));
    await assertSucceeds(getDocs(query(collection(asStudent(), "doubts"), where("hidden", "==", false))));
  });
  it("file a report, block a user, and save a study plan", async () => {
    await assertSucceeds(setDoc(doc(asStudent(), "reports/rep1"), {
      reporterId: STUDENT, targetType: "doubt", targetId: "d1", doubtId: "d1", reason: "spam", details: "", status: "open", createdAt: serverTimestamp()
    }));
    await assertSucceeds(setDoc(doc(asStudent(), `blocks/${STUDENT}/users/${OTHER}`), { blockedUid: OTHER, createdAt: serverTimestamp() }));
    await assertSucceeds(setDoc(doc(asStudent(), `studyPlans/${STUDENT}`), {
      uid: STUDENT, minutesPerDay: 120, examDate: "2027-03-01", subjects: ["mathematics"], allocation: { learning: 30 }, focusTopicIds: [], updatedAt: serverTimestamp()
    }));
    await assertFails(setDoc(doc(asStudent(), `studyPlans/${STUDENT}`), {
      uid: STUDENT, minutesPerDay: 5000, examDate: null, subjects: [], allocation: {}, focusTopicIds: [], updatedAt: serverTimestamp()
    }));
  });
});

describe("an admin can", () => {
  it("hide content, resolve reports and update claim status", async () => {
    await assertSucceeds(updateDoc(doc(asAdmin(), `doubts/d1`), { hidden: true }));
    await assertSucceeds(updateDoc(doc(asAdmin(), `rewardClaims/c1`), { status: "fulfilled" }));
    await assertSucceeds(updateDoc(doc(asAdmin(), `rewards/r1`), { available: false }));
  });
  it("still cannot write ledgers or streaks from the client", async () => {
    await assertFails(setDoc(doc(asAdmin(), `starsTransactions/x`), { userId: STUDENT, amount: 1000 }));
    await assertFails(updateDoc(doc(asAdmin(), `streaks/${STUDENT}`), { current: 100 }));
  });
});
