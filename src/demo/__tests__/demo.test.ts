import { beforeEach, describe, expect, it } from "vitest";
import { collection, doc, documentId, getDoc, getDocs, limit, orderBy, query, serverTimestamp, setDoc, where } from "../firestore";
import { createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut } from "../auth";
import { httpsCallable } from "../functions";
import { listDocs, resetStore, Timestamp } from "../store";
import { seedUserDocs } from "../seedData";
import type { DoubtDoc, ProblemSolutionDoc, PublicProfile, QuestionKeyDoc, QuizDoc, RewardDoc, TopicProgressDoc, UserDoc } from "../../lib/types";

const AARAV = "demo-aarav";
const call = <Input, Output>(name: string) => async (input: Input) => (await httpsCallable<Input, Output>({}, name)(input)).data;
const readUser = async () => (await getDoc(doc(null, "users", AARAV))).data() as unknown as UserDoc;

async function loginAarav(): Promise<void> {
  await signInWithEmailAndPassword({}, "aarav@vidyapath.demo", "demo1234");
}

beforeEach(() => {
  resetStore(seedUserDocs);
});

describe("firestore shim", () => {
  it("filters, orders and limits like the doubts page", async () => {
    const snapshot = await getDocs(query(collection(null, "doubts"), where("hidden", "==", false), orderBy("createdAt", "desc"), limit(30)));
    expect(snapshot.size).toBeGreaterThan(0);
    const rows = snapshot.docs.map((item) => ({ id: item.id, ...item.data() }) as unknown as DoubtDoc);
    for (let index = 1; index < rows.length; index += 1) {
      expect((rows[index - 1].createdAt as Timestamp).toMillis()).toBeGreaterThanOrEqual((rows[index].createdAt as Timestamp).toMillis());
    }
  });

  it("supports documentId() in, array-contains and nested collections", async () => {
    const quiz = (await getDoc(doc(null, "quizzes", "10-mathematics-real-numbers-euclids-division-lemma-quiz"))).data() as unknown as QuizDoc;
    const byId = await getDocs(query(collection(null, "questions"), where(documentId(), "in", quiz.questionIds.slice(0, 2))));
    expect(byId.docs.map((item) => item.id).sort()).toEqual(quiz.questionIds.slice(0, 2).sort());
    const topics = await getDocs(collection(null, `studentProgress/${AARAV}/topics`));
    expect(topics.size).toBe(8);
    await setDoc(doc(null, "twinChallenges/t1"), { members: ["a", "b"], createdAt: serverTimestamp() });
    const mine = await getDocs(query(collection(null, "twinChallenges"), where("members", "array-contains", "b")));
    expect(mine.size).toBe(1);
    expect(mine.docs[0].data().createdAt).toBeInstanceOf(Timestamp);
  });

  it("merges on setDoc with merge and drops docs missing an orderBy field", async () => {
    await setDoc(doc(null, "users", AARAV), { language: "hi" }, { merge: true });
    expect((await readUser()).name).toBe("Aarav Sharma");
    expect((await readUser()).language).toBe("hi");
    await setDoc(doc(null, "spinHistory/no-date"), { userId: AARAV });
    const history = await getDocs(query(collection(null, "spinHistory"), where("userId", "==", AARAV), orderBy("createdAt", "desc")));
    expect(history.docs.some((item) => item.id === "no-date")).toBe(false);
  });
});

describe("auth shim", () => {
  it("rejects wrong passwords with a Firebase-style code", async () => {
    await expect(signInWithEmailAndPassword({}, "aarav@vidyapath.demo", "nope")).rejects.toMatchObject({ code: "auth/invalid-credential" });
  });

  it("exposes admin claims and creates profile docs for new accounts", async () => {
    const admin = await signInWithEmailAndPassword({}, "admin@vidyapath.demo", "demo1234");
    expect((await admin.user.getIdTokenResult()).claims.admin).toBe(true);
    const created = await createUserWithEmailAndPassword({}, "new@vidyapath.demo", "secret1");
    await setDoc(doc(null, "users", created.user.uid), { uid: created.user.uid, email: "new@vidyapath.demo", name: "New", classLevel: 9, board: "CBSE", subjects: ["science"], goal: "board", role: "student", xp: 0, stars: 0, createdAt: serverTimestamp() });
    const profile = (await getDoc(doc(null, "publicProfiles", created.user.uid))).data() as unknown as PublicProfile;
    expect(profile.classLevel).toBe(9);
    expect(profile.twinStatus).toBe("none");
    expect((await getDoc(doc(null, "streaks", created.user.uid))).exists()).toBe(true);
  });

  it("blocks callables when signed out", async () => {
    await signOut();
    await expect(call("spinWheel")({})).rejects.toMatchObject({ code: "functions/unauthenticated" });
  });
});

describe("callables", () => {
  beforeEach(loginAarav);

  it("scores a quiz, rewards the first completion once, and is idempotent per attempt", async () => {
    const quizId = "10-mathematics-quadratic-equations-nature-of-roots-quiz";
    const quiz = (await getDoc(doc(null, "quizzes", quizId))).data() as unknown as QuizDoc;
    const answers: Record<string, number> = {};
    for (const questionId of quiz.questionIds) answers[questionId] = ((await getDoc(doc(null, "questionKeys", questionId))).data() as unknown as QuestionKeyDoc).correctIndex;
    const before = await readUser();
    const finalize = call<{ attemptId: string; quizId: string; answers: Record<string, number> }, { alreadyFinalized: boolean; score: number; total: number; firstCompletion?: boolean; rewards?: { xp: number; stars: number } }>("finalizeQuiz");
    const first = await finalize({ attemptId: "attempt-1", quizId, answers });
    expect(first).toMatchObject({ alreadyFinalized: false, firstCompletion: true, score: quiz.questionIds.length, total: quiz.questionIds.length });
    expect(first.rewards?.stars).toBe(quiz.questionIds.length);
    expect((await readUser()).stars).toBe(before.stars + quiz.questionIds.length);
    const again = await finalize({ attemptId: "attempt-1", quizId, answers });
    expect(again.alreadyFinalized).toBe(true);
    expect((await readUser()).stars).toBe(before.stars + quiz.questionIds.length);
  });

  it("checks problem answers against the solution and classifies mistakes", async () => {
    const problemId = "9-physics-motion-equations-of-motion-p1";
    const solution = (await getDoc(doc(null, "problemSolutions", problemId))).data() as unknown as ProblemSolutionDoc;
    const submit = call<{ attemptId: string; problemId: string; finalAnswer: string; steps: Record<string, string>; timeSpentSec: number }, { correct: boolean; rewarded: boolean; mistakeType: string | null; solution: unknown; rewards: { xp: number } }>("submitProblemAttempt");
    const wrong = await submit({ attemptId: "p-wrong", problemId, finalAnswer: "definitely not it", steps: {}, timeSpentSec: 30 });
    expect(wrong.correct).toBe(false);
    expect(wrong.mistakeType).not.toBeNull();
    expect(wrong.solution).toBeNull();
    expect(listDocs("mistakes").some((row) => row.data.problemId === problemId)).toBe(true);
    const right = await submit({ attemptId: "p-right", problemId, finalAnswer: solution.acceptedAnswers[0], steps: {}, timeSpentSec: 60 });
    expect(right).toMatchObject({ correct: true, rewarded: true });
    expect(right.rewards.xp).toBeGreaterThan(0);
    const progress = (await getDoc(doc(null, `studentProgress/${AARAV}/topics/9-physics-motion-equations-of-motion`))).data() as unknown as TopicProgressDoc;
    expect(progress.solvedProblemIds).toContain(problemId);
  });

  it("enforces the spin cooldown and reward balance", async () => {
    const spin = call<Record<string, never>, { result: string; nextSpinAt: number }>("spinWheel");
    const first = await spin({});
    expect(first.nextSpinAt).toBeGreaterThan(Date.now());
    await expect(spin({})).rejects.toMatchObject({ code: "functions/failed-precondition" });
    const rewards = (await getDocs(collection(null, "rewards"))).docs.map((item) => item.data() as unknown as RewardDoc);
    const tooExpensive = rewards.find((reward) => reward.available && reward.starsRequired > 10_000);
    const affordable = rewards.find((reward) => reward.available && reward.starsRequired <= 180);
    const claim = call<{ rewardId: string; claimKey: string }, { alreadyClaimed: boolean; starsSpent?: number }>("claimReward");
    if (tooExpensive) await expect(claim({ rewardId: tooExpensive.id, claimKey: "k1" })).rejects.toMatchObject({ code: "functions/failed-precondition" });
    expect(affordable).toBeDefined();
    const before = (await readUser()).stars;
    const result = await claim({ rewardId: affordable!.id, claimKey: "k2" });
    expect(result.starsSpent).toBe(affordable!.starsRequired);
    expect((await readUser()).stars).toBe(before - affordable!.starsRequired);
    expect((await claim({ rewardId: affordable!.id, claimKey: "k2" })).alreadyClaimed).toBe(true);
  });

  it("matches Aarav with the searching peer and runs a twin challenge", async () => {
    const match = await call<Record<string, never>, { status: string; pairId: string | null }>("matchStudyTwin")({});
    expect(match.status).toBe("matched");
    const meera = (await getDoc(doc(null, "publicProfiles", "demo-meera"))).data() as unknown as PublicProfile;
    expect(meera.twinPairId).toBe(match.pairId);
    const challenge = await call<{ pairId: string }, { challengeId: string; questionIds: string[] }>("createTwinChallenge")({ pairId: match.pairId! });
    expect(challenge.questionIds).toHaveLength(5);
    const submitted = await call<{ challengeId: string; answers: Record<string, number> }, { score: number; total: number }>("submitTwinChallenge")({ challengeId: challenge.challengeId, answers: {} });
    expect(submitted).toMatchObject({ score: 0, total: 5 });
  });

  it("answers from the guided fallback and records the conversation", async () => {
    const askAi = call<{ sessionId: string; mode: string; topicId: string }, { text: string; source: string; notice: string | null; remaining: number }>("askAi");
    const response = await askAi({ sessionId: "s1", mode: "explain", topicId: "10-mathematics-quadratic-equations-solving-by-factorisation" });
    expect(response.source).toBe("fallback");
    expect(response.text.length).toBeGreaterThan(20);
    const history = await getDocs(query(collection(null, `aiSessions/${AARAV}/messages`), where("sessionId", "==", "s1"), orderBy("createdAt", "asc"), limit(20)));
    expect(history.docs.map((item) => item.data().role)).toEqual(["user", "assistant"]);
  });

  it("posts, answers and votes on doubts with the anonymous name", async () => {
    const posted = await call<Record<string, unknown>, { doubtId: string }>("postDoubt")({ subjectId: "physics", chapterId: null, topicId: null, title: "Why does g vary?", body: "Does gravity change with altitude?" });
    await expect(call("postDoubt")({ subjectId: "physics", chapterId: null, topicId: null, title: "Another", body: "Too soon" })).rejects.toMatchObject({ code: "functions/resource-exhausted" });
    await signInWithEmailAndPassword({}, "priya@vidyapath.demo", "demo1234");
    const answered = await call<Record<string, unknown>, { answerId: string }>("postAnswer")({ doubtId: posted.doubtId, body: "Yes, it falls off with the square of distance." });
    await loginAarav();
    const voted = await call<Record<string, unknown>, { voteCount: number }>("voteAnswer")({ doubtId: posted.doubtId, answerId: answered.answerId });
    expect(voted.voteCount).toBe(1);
    const doubt = (await getDoc(doc(null, "doubts", posted.doubtId))).data() as unknown as DoubtDoc;
    expect(doubt).toMatchObject({ answerCount: 1, voteCount: 1, status: "answered" });
    expect(doubt.authorName).not.toContain("Aarav");
  });
});
