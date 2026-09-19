// Seeds content, demo accounts and demo progress. Usage:
//   npx tsx seed/seed.ts --check     validate JSON only, no Firebase access
//   npx tsx seed/seed.ts             validate, then write to the emulator or a real project
// Emulator: set FIRESTORE_EMULATOR_HOST and FIREBASE_AUTH_EMULATOR_HOST.
// Real project: set GOOGLE_APPLICATION_CREDENTIALS and FIREBASE_PROJECT_ID.
import "dotenv/config";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getAuth, type UserRecord } from "firebase-admin/auth";
import { FieldValue, Timestamp, getFirestore, type Firestore } from "firebase-admin/firestore";
import type {
  BadgeDoc, CareerPathDoc, ChapterDoc, DailyChallengeDoc, ModuleDoc, ProblemDoc, ProblemSolutionDoc, QuestionDoc, QuestionKeyDoc,
  QuizDoc, RewardConfig, RewardDoc, SubjectDoc, TopicDoc, StudyPlanAllocation
} from "../src/lib/types";

const contentDir = join(dirname(fileURLToPath(import.meta.url)), "content");
function loadJson<T>(name: string): T {
  return JSON.parse(readFileSync(join(contentDir, `${name}.json`), "utf8")) as T;
}

interface SeedDoubt {
  id: string; authorEmail: string; subjectId: string; chapterId: string; topicId: string; title: string; body: string; status: string;
  answers: { id: string; authorEmail: string; body: string; voteCount: number }[];
}

const subjects = loadJson<SubjectDoc[]>("subjects");
const chapters = loadJson<ChapterDoc[]>("chapters");
const topics = loadJson<TopicDoc[]>("topics");
const modules = loadJson<ModuleDoc[]>("modules");
const questions = loadJson<{ question: QuestionDoc; key: QuestionKeyDoc }[]>("questions");
const quizzes = loadJson<QuizDoc[]>("quizzes");
const problems = loadJson<{ problem: ProblemDoc; solution: ProblemSolutionDoc }[]>("problems");
const rewards = loadJson<RewardDoc[]>("rewards");
const challenges = loadJson<DailyChallengeDoc[]>("dailyChallenges");
const careers = loadJson<CareerPathDoc[]>("careerPaths");
const badges = loadJson<BadgeDoc[]>("badges");
const rewardConfig = loadJson<RewardConfig>("appConfig");
const doubts = loadJson<SeedDoubt[]>("doubts");

const MAIN_QUADRATIC_TOPIC = "10-mathematics-quadratic-equations-solving-by-factorisation";

// ---------- validation ----------
function validate(): string[] {
  const errors: string[] = [];
  const subjectIds = new Set(subjects.map((subject) => subject.id));
  const chapterIds = new Set(chapters.map((chapter) => chapter.id));
  const topicIds = new Set(topics.map((topic) => topic.id));
  const questionIds = new Set(questions.map((entry) => entry.question.id));
  const problemIds = new Set(problems.map((entry) => entry.problem.id));
  const quizIds = new Set(quizzes.map((quiz) => quiz.id));

  for (const chapter of chapters) if (!subjectIds.has(chapter.subjectId)) errors.push(`chapter ${chapter.id}: unknown subject`);
  for (const topic of topics) {
    if (!chapterIds.has(topic.chapterId)) errors.push(`topic ${topic.id}: unknown chapter ${topic.chapterId}`);
    if (topic.hasContent && (!topic.quizId || !quizIds.has(topic.quizId))) errors.push(`topic ${topic.id}: missing quiz`);
  }
  for (const module of modules) {
    if (!topicIds.has(module.topicId)) errors.push(`module ${module.id}: unknown topic`);
    if (!chapterIds.has(module.chapterId)) errors.push(`module ${module.id}: unknown chapter`);
  }
  const keyCounts = new Map<string, number>();
  for (const { question, key } of questions) {
    if (!topicIds.has(question.topicId)) errors.push(`question ${question.id}: unknown topic`);
    if (question.options.length !== 4) errors.push(`question ${question.id}: needs 4 options`);
    if (key.id !== question.id) errors.push(`question ${question.id}: key id mismatch`);
    if (key.correctIndex < 0 || key.correctIndex > 3) errors.push(`question ${question.id}: bad correctIndex`);
    keyCounts.set(question.id, (keyCounts.get(question.id) ?? 0) + 1);
  }
  for (const [id, count] of keyCounts) if (count !== 1) errors.push(`question ${id}: ${count} keys`);
  for (const quiz of quizzes) {
    if (!topicIds.has(quiz.topicId)) errors.push(`quiz ${quiz.id}: unknown topic`);
    for (const questionId of quiz.questionIds) if (!questionIds.has(questionId)) errors.push(`quiz ${quiz.id}: unknown question ${questionId}`);
  }
  const solutionCounts = new Map<string, number>();
  for (const { problem, solution } of problems) {
    if (!topicIds.has(problem.topicId)) errors.push(`problem ${problem.id}: unknown topic`);
    if (!chapterIds.has(problem.chapterId)) errors.push(`problem ${problem.id}: unknown chapter`);
    if (solution.id !== problem.id) errors.push(`problem ${problem.id}: solution id mismatch`);
    if (problem.hints.length < 2) errors.push(`problem ${problem.id}: needs 2+ hints`);
    if (solution.acceptedAnswers.length === 0) errors.push(`problem ${problem.id}: no accepted answers`);
    for (const field of ["hint", "concept", "guide", "checkApproach", "findMistake", "fullExplanation"] as const) {
      if (!solution.coach[field]) errors.push(`problem ${problem.id}: coach.${field} missing`);
    }
    for (const similar of problem.similarProblemIds) if (!problemIds.has(similar)) errors.push(`problem ${problem.id}: unknown similar ${similar}`);
    solutionCounts.set(problem.id, (solutionCounts.get(problem.id) ?? 0) + 1);
  }
  for (const [id, count] of solutionCounts) if (count !== 1) errors.push(`problem ${id}: ${count} solutions`);
  const mainLevels = new Set(problems.filter((entry) => entry.problem.topicId === MAIN_QUADRATIC_TOPIC).map((entry) => entry.problem.level));
  for (const level of [1, 2, 3, 4, 5]) if (!mainLevels.has(level as 1)) errors.push(`main quadratic topic: no level ${level} problems`);
  for (const challenge of challenges) for (const questionId of challenge.questionIds) if (!questionIds.has(questionId)) errors.push(`challenge ${challenge.id}: unknown question ${questionId}`);
  for (const doubt of doubts) {
    if (!chapterIds.has(doubt.chapterId)) errors.push(`doubt ${doubt.id}: unknown chapter`);
    if (!topicIds.has(doubt.topicId)) errors.push(`doubt ${doubt.id}: unknown topic`);
  }
  return errors;
}

// ---------- helpers shared with functions/src/lib/hash.ts ----------
const ADJECTIVES = ["Quiet", "Bright", "Swift", "Calm", "Keen", "Bold", "Clever", "Steady", "Curious", "Focused"];
const NOUNS = ["Falcon", "Otter", "Comet", "Maple", "Lynx", "Ember", "Orbit", "Pixel", "Harbor", "Summit"];
function anonUsername(uid: string): string {
  const digest = createHash("sha1").update(uid).digest();
  return `${ADJECTIVES[digest[0] % ADJECTIVES.length]}${NOUNS[digest[1] % NOUNS.length]}${(digest[2] % 90) + 10}`;
}
function avatarFor(uid: string): string {
  return `avatar-${(createHash("sha1").update(uid).digest()[3] % 8) + 1}`;
}
function contentHash(text: string): string {
  return createHash("sha1").update(text.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim()).digest("hex");
}
function istDate(date: Date): string {
  return new Date(date.getTime() + 5.5 * 3600_000).toISOString().slice(0, 10);
}
function daysAgoIst(days: number): string {
  return istDate(new Date(Date.now() - days * 86_400_000));
}
function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing ${name} in .env`);
  return value;
}

// ---------- firebase ----------
function connect(): { db: Firestore; auth: ReturnType<typeof getAuth> } {
  const emulator = Boolean(process.env.FIRESTORE_EMULATOR_HOST);
  if (getApps().length === 0) {
    if (emulator) {
      initializeApp({ projectId: process.env.FIREBASE_PROJECT_ID || "demo-vidyapath" });
    } else {
      const credentialsPath = requireEnv("GOOGLE_APPLICATION_CREDENTIALS");
      initializeApp({ credential: cert(credentialsPath), projectId: requireEnv("FIREBASE_PROJECT_ID") });
    }
  }
  return { db: getFirestore(), auth: getAuth() };
}

async function writeCollection(db: Firestore, name: string, docs: { id: string }[]): Promise<void> {
  const chunks: { id: string }[][] = [];
  for (let index = 0; index < docs.length; index += 400) chunks.push(docs.slice(index, index + 400));
  for (const chunk of chunks) {
    const batch = db.batch();
    for (const item of chunk) batch.set(db.doc(`${name}/${item.id}`), item);
    await batch.commit();
  }
}

async function ensureUser(auth: ReturnType<typeof getAuth>, email: string, password: string, displayName: string, admin: boolean): Promise<UserRecord> {
  let record: UserRecord;
  try {
    record = await auth.getUserByEmail(email);
    await auth.updateUser(record.uid, { password, displayName, emailVerified: true });
  } catch {
    record = await auth.createUser({ email, password, displayName, emailVerified: true });
  }
  await auth.setCustomUserClaims(record.uid, admin ? { admin: true } : {});
  return record;
}

interface SeedProfile {
  email: string; password: string; name: string; goal: string; subjects: string[]; role: "student" | "admin";
  xp: number; stars: number; twinStatus: "none" | "searching";
}

async function writeUserDocs(db: Firestore, uid: string, profile: SeedProfile, extra: Record<string, unknown>): Promise<void> {
  const now = FieldValue.serverTimestamp();
  await db.doc(`users/${uid}`).set({
    uid, email: profile.email, name: profile.name, classLevel: 10, board: "CBSE", stream: null, language: "en",
    subjects: profile.subjects, goal: profile.goal, role: profile.role, xp: profile.xp, stars: profile.stars,
    questionsSolved: 0, modulesCompleted: 0, badgeIds: [], problemsSolved: 0, revisionsCompleted: 0,
    createdAt: now, updatedAt: now, ...extra
  }, { merge: true });
  await db.doc(`publicProfiles/${uid}`).set({
    uid, anonUsername: anonUsername(uid), avatar: avatarFor(uid), classLevel: 10, goal: profile.goal, level: 1,
    subjects: profile.subjects, progressSummary: { accuracy: 0, questionsSolved: 0, modulesCompleted: 0 },
    twinStatus: profile.twinStatus, twinPairId: null, updatedAt: now
  }, { merge: true });
  await db.doc(`streaks/${uid}`).set({ uid, current: 0, longest: 0, lastQualifiedDate: null, milestonesAwarded: [], updatedAt: now }, { merge: true });
  await db.doc(`spinState/${uid}`).set({ uid, nextSpinAt: null, lastResult: null, totalSpins: 0 }, { merge: true });
}

function allocation(minutesPerDay: number): StudyPlanAllocation {
  const weights = { learning: 25, problems: 33, revision: 17, quiz: 13, ai: 8, breaks: 4 };
  const keys = Object.keys(weights) as (keyof StudyPlanAllocation)[];
  const total = Object.values(weights).reduce((sum, weight) => sum + weight, 0);
  const result = {} as StudyPlanAllocation;
  let assigned = 0;
  keys.forEach((key, index) => {
    result[key] = index === keys.length - 1 ? minutesPerDay - assigned : Math.round((minutesPerDay * weights[key]) / total);
    assigned += result[key];
  });
  return result;
}

async function seedAarav(db: Firestore, uid: string): Promise<void> {
  const now = FieldValue.serverTimestamp();
  const topicById = new Map(topics.map((topic) => [topic.id, topic]));
  const progressRows: { topicId: string; attempts: number; correct: number; levelUnlocked: number; suggestedLevel: number; mistakeCounts: Record<string, number>; levelStats: Record<string, { attempts: number; correct: number }>; solved: string[] }[] = [
    { topicId: "10-mathematics-real-numbers-euclids-division-lemma", attempts: 12, correct: 11, levelUnlocked: 3, suggestedLevel: 3, mistakeCounts: {}, levelStats: { "1": { attempts: 6, correct: 6 }, "2": { attempts: 6, correct: 5 } }, solved: [] },
    { topicId: "10-mathematics-real-numbers-fundamental-theorem-of-arithmetic", attempts: 12, correct: 11, levelUnlocked: 3, suggestedLevel: 3, mistakeCounts: { calculation: 1 }, levelStats: { "1": { attempts: 6, correct: 6 }, "2": { attempts: 6, correct: 5 } }, solved: [] },
    { topicId: "10-mathematics-polynomials-zeros-and-coefficients", attempts: 10, correct: 8, levelUnlocked: 2, suggestedLevel: 2, mistakeCounts: { sign: 2 }, levelStats: { "1": { attempts: 6, correct: 5 }, "2": { attempts: 4, correct: 3 } }, solved: [] },
    { topicId: "10-mathematics-quadratic-equations-standard-form", attempts: 8, correct: 7, levelUnlocked: 2, suggestedLevel: 2, mistakeCounts: { misread: 1 }, levelStats: { "1": { attempts: 6, correct: 6 }, "2": { attempts: 2, correct: 1 } }, solved: [] },
    { topicId: MAIN_QUADRATIC_TOPIC, attempts: 13, correct: 7, levelUnlocked: 2, suggestedLevel: 2, mistakeCounts: { concept: 4, calculation: 2 }, levelStats: { "1": { attempts: 8, correct: 7 }, "2": { attempts: 5, correct: 0 } }, solved: [`${MAIN_QUADRATIC_TOPIC}-p1`, `${MAIN_QUADRATIC_TOPIC}-p2`, `${MAIN_QUADRATIC_TOPIC}-p3`] },
    { topicId: "10-mathematics-quadratic-equations-nature-of-roots", attempts: 6, correct: 4, levelUnlocked: 1, suggestedLevel: 1, mistakeCounts: { sign: 1, formula: 1 }, levelStats: { "1": { attempts: 6, correct: 4 } }, solved: [] },
    { topicId: "9-physics-motion-equations-of-motion", attempts: 11, correct: 7, levelUnlocked: 2, suggestedLevel: 2, mistakeCounts: { sign: 2, unit: 1, formula: 1 }, levelStats: { "1": { attempts: 6, correct: 5 }, "2": { attempts: 5, correct: 2 } }, solved: ["9-physics-motion-equations-of-motion-p2"] },
    { topicId: "10-chemistry-chemical-reactions-and-equations-balancing-equations", attempts: 11, correct: 8, levelUnlocked: 2, suggestedLevel: 2, mistakeCounts: { concept: 2, calculation: 1 }, levelStats: { "1": { attempts: 7, correct: 6 }, "2": { attempts: 4, correct: 2 } }, solved: ["10-chemistry-chemical-reactions-and-equations-balancing-equations-p1"] }
  ];
  for (const row of progressRows) {
    const topic = topicById.get(row.topicId)!;
    const accuracy = Math.round((row.correct / row.attempts) * 100);
    await db.doc(`studentProgress/${uid}/topics/${row.topicId}`).set({
      topicId: row.topicId, chapterId: topic.chapterId, subjectId: topic.subjectId, classLevel: topic.classLevel,
      levelUnlocked: row.levelUnlocked, attempts: row.attempts, correct: row.correct, accuracy,
      solvedProblemIds: row.solved, revealedProblemIds: [], levelStats: row.levelStats,
      adaptive: { consecutiveCorrect: 0, consecutiveWrong: 0, suggestedLevel: row.suggestedLevel },
      mistakeCounts: row.mistakeCounts, mastery: Math.round(((row.levelUnlocked - 1) * 20 + accuracy * 0.2) * 10) / 10,
      lastPracticedAt: Timestamp.fromDate(new Date(Date.now() - 86_400_000))
    });
  }
  const completedModules = ["10-mathematics-real-numbers-euclids-division-lemma-m1", "10-mathematics-real-numbers-euclids-division-lemma-m2", "10-mathematics-real-numbers-fundamental-theorem-of-arithmetic-m1", "10-mathematics-quadratic-equations-standard-form-m1"];
  const moduleById = new Map(modules.map((module) => [module.id, module]));
  for (const moduleId of completedModules) {
    const module = moduleById.get(moduleId)!;
    await db.doc(`studentProgress/${uid}/modules/${moduleId}`).set({ moduleId, topicId: module.topicId, subjectId: module.subjectId, status: "completed", startedAt: Timestamp.fromDate(new Date(Date.now() - 5 * 86_400_000)), completedAt: Timestamp.fromDate(new Date(Date.now() - 4 * 86_400_000)) });
  }
  const startedModule = moduleById.get(`${MAIN_QUADRATIC_TOPIC}-m1`)!;
  await db.doc(`studentProgress/${uid}/modules/${startedModule.id}`).set({ moduleId: startedModule.id, topicId: startedModule.topicId, subjectId: startedModule.subjectId, status: "started", startedAt: Timestamp.fromDate(new Date(Date.now() - 86_400_000)), completedAt: null });

  const mistakeTypes = ["concept", "concept", "concept", "concept", "calculation", "calculation"];
  for (const [index, type] of mistakeTypes.entries()) {
    await db.doc(`mistakes/seed_${uid}_${index}`).set({
      id: `seed_${uid}_${index}`, userId: uid, problemId: `${MAIN_QUADRATIC_TOPIC}-p${4 + (index % 3)}`, questionId: null, topicId: MAIN_QUADRATIC_TOPIC, subjectId: "mathematics",
      type, note: "Seeded practice mistake", createdAt: Timestamp.fromDate(new Date(Date.now() - (index + 1) * 12 * 3600_000))
    });
  }

  const xpRows: [string, string, number][] = [["module_completed", completedModules[0], 50], ["module_completed", completedModules[1], 50], ["module_completed", completedModules[2], 50], ["module_completed", completedModules[3], 50], ["quiz_completed", "10-mathematics-real-numbers-euclids-division-lemma-quiz", 60], ["problem_solved", `${MAIN_QUADRATIC_TOPIC}-p1`, 20], ["daily_challenge", "challenge-1", 80], ["revision_session", "10-mathematics-real-numbers-euclids-division-lemma", 25]];
  for (const [index, [reason, refId, amount]] of xpRows.entries()) {
    await db.doc(`xpTransactions/seed_${uid}_xp${index}`).set({ id: `seed_${uid}_xp${index}`, userId: uid, amount, reason, refId, createdAt: Timestamp.fromDate(new Date(Date.now() - (8 - index) * 8 * 3600_000)) });
  }
  const starRows: [string, string, number][] = [["quiz_completed", "10-mathematics-real-numbers-euclids-division-lemma-quiz", 6], ["problem_solved", `${MAIN_QUADRATIC_TOPIC}-p1`, 1], ["daily_challenge", "challenge-1", 10], ["spin_wheel", "seed-spin", 25]];
  for (const [index, [reason, refId, amount]] of starRows.entries()) {
    await db.doc(`starsTransactions/seed_${uid}_st${index}`).set({ id: `seed_${uid}_st${index}`, userId: uid, amount, reason, refId, createdAt: Timestamp.fromDate(new Date(Date.now() - (4 - index) * 10 * 3600_000)) });
  }
  const minutesByDay = [25, 40, 35, 60, 30, 45, 50];
  for (let daysBack = 1; daysBack <= 7; daysBack += 1) {
    const date = daysAgoIst(daysBack);
    await db.doc(`dailyActivity/${uid}_${date}`).set({ uid, date, minutes: minutesByDay[daysBack - 1], questions: 6 + daysBack, modules: daysBack === 4 ? 1 : 0, revisions: daysBack === 2 ? 1 : 0, qualified: true, updatedAt: now });
  }
  await db.doc(`streaks/${uid}`).set({ uid, current: 17, longest: 17, lastQualifiedDate: daysAgoIst(1), milestonesAwarded: [1, 7], updatedAt: now });
  await db.doc(`studyPlans/${uid}`).set({ uid, minutesPerDay: 120, examDate: "2027-03-01", subjects: ["mathematics", "physics", "chemistry"], allocation: allocation(120), focusTopicIds: [MAIN_QUADRATIC_TOPIC, "9-physics-motion-equations-of-motion"], updatedAt: now });

  const quizIds = ["10-mathematics-real-numbers-euclids-division-lemma-quiz", "10-mathematics-real-numbers-fundamental-theorem-of-arithmetic-quiz", `${MAIN_QUADRATIC_TOPIC}-quiz`];
  const keyById = new Map(questions.map((entry) => [entry.key.id, entry.key]));
  for (const [index, quizId] of quizIds.entries()) {
    const quiz = quizzes.find((item) => item.id === quizId)!;
    const answers: Record<string, number> = {};
    const results: Record<string, { correctIndex: number; explanation: string; correct: boolean }> = {};
    let score = 0;
    quiz.questionIds.forEach((questionId, questionIndex) => {
      const key = keyById.get(questionId)!;
      const correct = index < 2 ? questionIndex !== 3 : questionIndex % 2 === 0;
      answers[questionId] = correct ? key.correctIndex : (key.correctIndex + 1) % 4;
      results[questionId] = { correctIndex: key.correctIndex, explanation: key.explanation, correct };
      if (correct) score += 1;
    });
    const attemptId = `seed_${uid}_quiz${index}`;
    await db.doc(`quizAttempts/${attemptId}`).set({ id: attemptId, userId: uid, quizId, answers, finalized: true, score, total: quiz.questionIds.length, results, createdAt: Timestamp.fromDate(new Date(Date.now() - (3 - index) * 86_400_000)), finalizedAt: Timestamp.fromDate(new Date(Date.now() - (3 - index) * 86_400_000)) });
    await db.doc(`quizCompletions/${uid}_${quizId}`).set({ userId: uid, quizId, attemptId, score, total: quiz.questionIds.length, createdAt: now });
  }
  const attemptRows: [string, string, boolean, string | null][] = [[`${MAIN_QUADRATIC_TOPIC}-p1`, "2, 3", true, null], [`${MAIN_QUADRATIC_TOPIC}-p4`, "3, 1", false, "concept"], [`${MAIN_QUADRATIC_TOPIC}-p5`, "1, 1/3", false, "sign"]];
  for (const [index, [problemId, finalAnswer, correct, mistakeType]] of attemptRows.entries()) {
    const attemptId = `seed_${uid}_attempt${index}`;
    await db.doc(`problemAttempts/${attemptId}`).set({ id: attemptId, userId: uid, problemId, topicId: MAIN_QUADRATIC_TOPIC, subjectId: "mathematics", level: index === 0 ? 1 : 2, finalAnswer, steps: {}, timeSpentSec: 180 + index * 60, correct, mistakeType, rewarded: correct, createdAt: Timestamp.fromDate(new Date(Date.now() - (3 - index) * 6 * 3600_000)) });
  }
  for (const badgeId of ["first_module", "problems_10", "streak_7"]) {
    await db.doc(`userBadges/${uid}/badges/${badgeId}`).set({ badgeId, awardedAt: now });
  }
  const notifications: [string, string, string, string][] = [["challenge", "Daily Challenge is ready", "Five questions, ten minutes, XP and Stars.", "/challenges"], ["revision", "Revise Quadratic Equations", "Your accuracy dropped to 54%. A short revision will help.", "/revision"], ["streak", "17-day streak", "Keep your streak alive with one meaningful action today.", "/dashboard"]];
  for (const [index, [type, title, body, link]] of notifications.entries()) {
    await db.doc(`notifications/${uid}/items/seed_${index}`).set({ id: `seed_${index}`, type, title, body, link, read: false, createdAt: Timestamp.fromDate(new Date(Date.now() - index * 3600_000)) });
  }
  await db.doc(`users/${uid}`).set({ xp: 2450, stars: 180, questionsSolved: 63, modulesCompleted: 4, problemsSolved: 12, revisionsCompleted: 3, badgeIds: ["first_module", "problems_10", "streak_7"] }, { merge: true });
  await db.doc(`publicProfiles/${uid}`).set({ level: 2, progressSummary: { accuracy: 76, questionsSolved: 63, modulesCompleted: 4 } }, { merge: true });
}

async function seedDoubts(db: Firestore, uidByEmail: Map<string, string>, allUids: string[]): Promise<void> {
  for (const doubt of doubts) {
    const authorId = uidByEmail.get(doubt.authorEmail)!;
    const answerVotes = doubt.answers.reduce((sum, answer) => sum + answer.voteCount, 0);
    await db.doc(`doubts/${doubt.id}`).set({
      id: doubt.id, authorId, authorName: anonUsername(authorId), subjectId: doubt.subjectId, chapterId: doubt.chapterId, topicId: doubt.topicId,
      title: doubt.title, body: doubt.body, status: doubt.status, hidden: false, answerCount: doubt.answers.length, voteCount: answerVotes,
      contentHash: contentHash(`${doubt.title} ${doubt.body}`), createdAt: Timestamp.fromDate(new Date(Date.now() - 2 * 86_400_000))
    });
    for (const answer of doubt.answers) {
      const answerAuthor = uidByEmail.get(answer.authorEmail)!;
      await db.doc(`doubts/${doubt.id}/answers/${answer.id}`).set({
        id: answer.id, doubtId: doubt.id, authorId: answerAuthor, authorName: anonUsername(answerAuthor), body: answer.body, voteCount: answer.voteCount,
        hidden: false, contentHash: contentHash(answer.body), createdAt: Timestamp.fromDate(new Date(Date.now() - 86_400_000))
      });
      const voters = allUids.filter((uid) => uid !== answerAuthor).slice(0, answer.voteCount);
      for (const voterUid of voters) {
        await db.doc(`votes/${voterUid}_${answer.id}`).set({ id: `${voterUid}_${answer.id}`, userId: voterUid, doubtId: doubt.id, answerId: answer.id, createdAt: FieldValue.serverTimestamp() });
      }
    }
  }
}

async function main(): Promise<void> {
  const errors = validate();
  if (errors.length) {
    console.error(`Content validation failed with ${errors.length} error(s):`);
    for (const error of errors) console.error(`  - ${error}`);
    process.exit(1);
  }
  console.log(`Content OK: ${chapters.length} chapters, ${topics.length} topics, ${modules.length} modules, ${questions.length} questions, ${quizzes.length} quizzes, ${problems.length} problems, ${challenges.length} challenges, ${doubts.length} doubts`);
  if (process.argv.includes("--check")) return;

  const { db, auth } = connect();
  await writeCollection(db, "subjects", subjects);
  await writeCollection(db, "chapters", chapters);
  await writeCollection(db, "topics", topics);
  await writeCollection(db, "modules", modules);
  await writeCollection(db, "questions", questions.map((entry) => entry.question));
  await writeCollection(db, "questionKeys", questions.map((entry) => entry.key));
  await writeCollection(db, "quizzes", quizzes);
  await writeCollection(db, "problems", problems.map((entry) => entry.problem));
  await writeCollection(db, "problemSolutions", problems.map((entry) => entry.solution));
  await writeCollection(db, "rewards", rewards);
  await writeCollection(db, "dailyChallenges", challenges);
  await writeCollection(db, "careerPaths", careers);
  await writeCollection(db, "badges", badges);
  await db.doc("appConfig/rewards").set(rewardConfig);
  console.log("Content written.");

  const peerPassword = requireEnv("DEMO_PEER_PASSWORD");
  const profiles: SeedProfile[] = [
    { email: requireEnv("DEMO_STUDENT_EMAIL"), password: requireEnv("DEMO_STUDENT_PASSWORD"), name: "Aarav Sharma", goal: "board_jee", subjects: ["mathematics", "physics", "chemistry"], role: "student", xp: 2450, stars: 180, twinStatus: "none" },
    { email: requireEnv("DEMO_ADMIN_EMAIL"), password: requireEnv("DEMO_ADMIN_PASSWORD"), name: "VidyaPath Admin", goal: "board", subjects: ["mathematics"], role: "admin", xp: 0, stars: 0, twinStatus: "none" },
    { email: "priya@vidyapath.demo", password: peerPassword, name: "Priya Nair", goal: "board", subjects: ["mathematics", "physics", "chemistry"], role: "student", xp: 1800, stars: 90, twinStatus: "none" },
    { email: "rahul@vidyapath.demo", password: peerPassword, name: "Rahul Verma", goal: "board_neet", subjects: ["physics", "chemistry", "biology"], role: "student", xp: 1250, stars: 60, twinStatus: "none" },
    { email: "meera@vidyapath.demo", password: peerPassword, name: "Meera Iyer", goal: "board_jee", subjects: ["mathematics", "physics", "chemistry"], role: "student", xp: 2100, stars: 140, twinStatus: "searching" }
  ];
  const uidByEmail = new Map<string, string>();
  for (const profile of profiles) {
    const record = await ensureUser(auth, profile.email, profile.password, profile.name, profile.role === "admin");
    uidByEmail.set(profile.email, record.uid);
    await writeUserDocs(db, record.uid, profile, {});
    console.log(`User ready: ${profile.email} (${profile.role})`);
  }
  await seedAarav(db, uidByEmail.get(profiles[0].email)!);
  await seedDoubts(db, uidByEmail, [...uidByEmail.values()]);
  console.log("Demo student, peers and doubts written.");
  console.log(`Done. Demo login: ${profiles[0].email}. Admin: ${profiles[1].email}.`);
}

main().catch((error) => {
  console.error("Seeding failed:", error instanceof Error ? error.message : error);
  process.exit(1);
});
