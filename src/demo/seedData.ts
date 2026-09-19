// Demo dataset: the seed/content collections plus the same demo accounts and progress that seed/seed.ts writes.
import subjectsJson from "../../seed/content/subjects.json";
import chaptersJson from "../../seed/content/chapters.json";
import topicsJson from "../../seed/content/topics.json";
import modulesJson from "../../seed/content/modules.json";
import questionsJson from "../../seed/content/questions.json";
import quizzesJson from "../../seed/content/quizzes.json";
import problemsJson from "../../seed/content/problems.json";
import rewardsJson from "../../seed/content/rewards.json";
import challengesJson from "../../seed/content/dailyChallenges.json";
import careersJson from "../../seed/content/careerPaths.json";
import badgesJson from "../../seed/content/badges.json";
import appConfigJson from "../../seed/content/appConfig.json";
import doubtsJson from "../../seed/content/doubts.json";
import { anonUsername, avatarFor, contentHash } from "./hash";
import { Timestamp, type DocData } from "./store";
import type { Goal, ModuleDoc, ProblemDoc, ProblemSolutionDoc, QuestionDoc, QuestionKeyDoc, QuizDoc, StudyPlanAllocation, SubjectId, TopicDoc } from "../lib/types";

const questions = questionsJson as unknown as { question: QuestionDoc; key: QuestionKeyDoc }[];
const problems = problemsJson as unknown as { problem: ProblemDoc; solution: ProblemSolutionDoc }[];
const topics = topicsJson as unknown as TopicDoc[];
const modules = modulesJson as unknown as ModuleDoc[];
const quizzes = quizzesJson as unknown as QuizDoc[];

interface SeedDoubt {
  id: string; authorEmail: string; subjectId: string; chapterId: string; topicId: string; title: string; body: string; status: string;
  answers: { id: string; authorEmail: string; body: string; voteCount: number }[];
}

export function contentDocs(): Map<string, DocData> {
  const docs = new Map<string, DocData>();
  const put = (collectionName: string, rows: { id: string }[]) => {
    for (const row of rows) docs.set(`${collectionName}/${row.id}`, row as unknown as DocData);
  };
  put("subjects", subjectsJson);
  put("chapters", chaptersJson);
  put("topics", topics);
  put("modules", modules);
  put("questions", questions.map((entry) => entry.question));
  put("questionKeys", questions.map((entry) => entry.key));
  put("quizzes", quizzes);
  put("problems", problems.map((entry) => entry.problem));
  put("problemSolutions", problems.map((entry) => entry.solution));
  put("rewards", rewardsJson);
  put("dailyChallenges", challengesJson);
  put("careerPaths", careersJson);
  put("badges", badgesJson);
  docs.set("appConfig/rewards", appConfigJson as DocData);
  return docs;
}

export const DEMO_PASSWORD = "demo1234";

export interface DemoAccount {
  uid: string; email: string; name: string; role: "student" | "admin"; goal: Goal; subjects: SubjectId[]; xp: number; stars: number; twinStatus: "none" | "searching";
}

export const DEMO_ACCOUNTS: DemoAccount[] = [
  { uid: "admin-uday", email: "uday12462@gmail.com", name: "Uday (App Owner)", role: "admin", goal: "board_jee", subjects: ["mathematics", "physics", "chemistry"], xp: 4500, stars: 350, twinStatus: "none" },
  { uid: "demo-aarav", email: "aarav@vidyapath.demo", name: "Aarav Sharma", role: "student", goal: "board_jee", subjects: ["mathematics", "physics", "chemistry"], xp: 2450, stars: 180, twinStatus: "none" },
  { uid: "demo-admin", email: "admin@vidyapath.demo", name: "VidyaPath Admin", role: "admin", goal: "board", subjects: ["mathematics"], xp: 0, stars: 0, twinStatus: "none" },
  { uid: "demo-priya", email: "priya@vidyapath.demo", name: "Priya Nair", role: "student", goal: "board", subjects: ["mathematics", "physics", "chemistry"], xp: 1800, stars: 90, twinStatus: "none" },
  { uid: "demo-rahul", email: "rahul@vidyapath.demo", name: "Rahul Verma", role: "student", goal: "board_neet", subjects: ["physics", "chemistry", "biology"], xp: 1250, stars: 60, twinStatus: "none" },
  { uid: "demo-meera", email: "meera@vidyapath.demo", name: "Meera Iyer", role: "student", goal: "board_jee", subjects: ["mathematics", "physics", "chemistry"], xp: 2100, stars: 140, twinStatus: "searching" }
];

const MAIN_QUADRATIC_TOPIC = "10-mathematics-quadratic-equations-solving-by-factorisation";
const HOUR = 3600_000;
const DAY = 86_400_000;

function ago(millis: number): Timestamp {
  return Timestamp.fromMillis(Date.now() - millis);
}
function daysAgoIst(days: number): string {
  return new Date(Date.now() - days * DAY + 5.5 * HOUR).toISOString().slice(0, 10);
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

type Put = (path: string, data: DocData) => void;

function seedAarav(put: Put, uid: string): void {
  const now = Timestamp.now();
  const topicById = new Map(topics.map((topic) => [topic.id, topic]));
  const progressRows = [
    { topicId: "10-mathematics-real-numbers-euclids-division-lemma", attempts: 12, correct: 11, levelUnlocked: 3, suggestedLevel: 3, mistakeCounts: {}, levelStats: { "1": { attempts: 6, correct: 6 }, "2": { attempts: 6, correct: 5 } }, solved: [] as string[] },
    { topicId: "10-mathematics-real-numbers-fundamental-theorem-of-arithmetic", attempts: 12, correct: 11, levelUnlocked: 3, suggestedLevel: 3, mistakeCounts: { calculation: 1 }, levelStats: { "1": { attempts: 6, correct: 6 }, "2": { attempts: 6, correct: 5 } }, solved: [] as string[] },
    { topicId: "10-mathematics-polynomials-zeros-and-coefficients", attempts: 10, correct: 8, levelUnlocked: 2, suggestedLevel: 2, mistakeCounts: { sign: 2 }, levelStats: { "1": { attempts: 6, correct: 5 }, "2": { attempts: 4, correct: 3 } }, solved: [] as string[] },
    { topicId: "10-mathematics-quadratic-equations-standard-form", attempts: 8, correct: 7, levelUnlocked: 2, suggestedLevel: 2, mistakeCounts: { misread: 1 }, levelStats: { "1": { attempts: 6, correct: 6 }, "2": { attempts: 2, correct: 1 } }, solved: [] as string[] },
    { topicId: MAIN_QUADRATIC_TOPIC, attempts: 13, correct: 7, levelUnlocked: 2, suggestedLevel: 2, mistakeCounts: { concept: 4, calculation: 2 }, levelStats: { "1": { attempts: 8, correct: 7 }, "2": { attempts: 5, correct: 0 } }, solved: [`${MAIN_QUADRATIC_TOPIC}-p1`, `${MAIN_QUADRATIC_TOPIC}-p2`, `${MAIN_QUADRATIC_TOPIC}-p3`] },
    { topicId: "10-mathematics-quadratic-equations-nature-of-roots", attempts: 6, correct: 4, levelUnlocked: 1, suggestedLevel: 1, mistakeCounts: { sign: 1, formula: 1 }, levelStats: { "1": { attempts: 6, correct: 4 } }, solved: [] as string[] },
    { topicId: "9-physics-motion-equations-of-motion", attempts: 11, correct: 7, levelUnlocked: 2, suggestedLevel: 2, mistakeCounts: { sign: 2, unit: 1, formula: 1 }, levelStats: { "1": { attempts: 6, correct: 5 }, "2": { attempts: 5, correct: 2 } }, solved: ["9-physics-motion-equations-of-motion-p2"] },
    { topicId: "10-chemistry-chemical-reactions-and-equations-balancing-equations", attempts: 11, correct: 8, levelUnlocked: 2, suggestedLevel: 2, mistakeCounts: { concept: 2, calculation: 1 }, levelStats: { "1": { attempts: 7, correct: 6 }, "2": { attempts: 4, correct: 2 } }, solved: ["10-chemistry-chemical-reactions-and-equations-balancing-equations-p1"] }
  ];
  for (const row of progressRows) {
    const topic = topicById.get(row.topicId);
    if (!topic) throw new Error(`Demo seed references unknown topic ${row.topicId}`);
    const accuracy = Math.round((row.correct / row.attempts) * 100);
    put(`studentProgress/${uid}/topics/${row.topicId}`, {
      topicId: row.topicId, chapterId: topic.chapterId, subjectId: topic.subjectId, classLevel: topic.classLevel,
      levelUnlocked: row.levelUnlocked, attempts: row.attempts, correct: row.correct, accuracy,
      solvedProblemIds: row.solved, revealedProblemIds: [], levelStats: row.levelStats,
      adaptive: { consecutiveCorrect: 0, consecutiveWrong: 0, suggestedLevel: row.suggestedLevel },
      mistakeCounts: row.mistakeCounts, mastery: Math.round(((row.levelUnlocked - 1) * 20 + accuracy * 0.2) * 10) / 10,
      lastPracticedAt: ago(DAY)
    });
  }
  const completedModules = ["10-mathematics-real-numbers-euclids-division-lemma-m1", "10-mathematics-real-numbers-euclids-division-lemma-m2", "10-mathematics-real-numbers-fundamental-theorem-of-arithmetic-m1", "10-mathematics-quadratic-equations-standard-form-m1"];
  const moduleById = new Map(modules.map((module) => [module.id, module]));
  const moduleProgress = (moduleId: string, status: "started" | "completed") => {
    const module = moduleById.get(moduleId);
    if (!module) throw new Error(`Demo seed references unknown module ${moduleId}`);
    put(`studentProgress/${uid}/modules/${moduleId}`, { moduleId, topicId: module.topicId, subjectId: module.subjectId, status, startedAt: ago(status === "completed" ? 5 * DAY : DAY), completedAt: status === "completed" ? ago(4 * DAY) : null });
  };
  for (const moduleId of completedModules) moduleProgress(moduleId, "completed");
  moduleProgress(`${MAIN_QUADRATIC_TOPIC}-m1`, "started");

  const mistakeTypes = ["concept", "concept", "concept", "concept", "calculation", "calculation"];
  mistakeTypes.forEach((type, index) => {
    put(`mistakes/seed_${uid}_${index}`, { id: `seed_${uid}_${index}`, userId: uid, problemId: `${MAIN_QUADRATIC_TOPIC}-p${4 + (index % 3)}`, questionId: null, topicId: MAIN_QUADRATIC_TOPIC, subjectId: "mathematics", type, note: "Seeded practice mistake", createdAt: ago((index + 1) * 12 * HOUR) });
  });

  const xpRows: [string, string, number][] = [["module_completed", completedModules[0], 50], ["module_completed", completedModules[1], 50], ["module_completed", completedModules[2], 50], ["module_completed", completedModules[3], 50], ["quiz_completed", "10-mathematics-real-numbers-euclids-division-lemma-quiz", 60], ["problem_solved", `${MAIN_QUADRATIC_TOPIC}-p1`, 20], ["daily_challenge", "challenge-1", 80], ["revision_session", "10-mathematics-real-numbers-euclids-division-lemma", 25]];
  xpRows.forEach(([reason, refId, amount], index) => {
    put(`xpTransactions/seed_${uid}_xp${index}`, { id: `seed_${uid}_xp${index}`, userId: uid, amount, reason, refId, createdAt: ago((8 - index) * 8 * HOUR) });
  });
  const starRows: [string, string, number][] = [["quiz_completed", "10-mathematics-real-numbers-euclids-division-lemma-quiz", 6], ["problem_solved", `${MAIN_QUADRATIC_TOPIC}-p1`, 1], ["daily_challenge", "challenge-1", 10], ["spin_wheel", "seed-spin", 25]];
  starRows.forEach(([reason, refId, amount], index) => {
    put(`starsTransactions/seed_${uid}_st${index}`, { id: `seed_${uid}_st${index}`, userId: uid, amount, reason, refId, createdAt: ago((4 - index) * 10 * HOUR) });
  });
  const minutesByDay = [25, 40, 35, 60, 30, 45, 50];
  for (let daysBack = 1; daysBack <= 7; daysBack += 1) {
    const date = daysAgoIst(daysBack);
    put(`dailyActivity/${uid}_${date}`, { uid, date, minutes: minutesByDay[daysBack - 1], questions: 6 + daysBack, modules: daysBack === 4 ? 1 : 0, revisions: daysBack === 2 ? 1 : 0, qualified: true, updatedAt: now });
  }
  put(`streaks/${uid}`, { uid, current: 17, longest: 17, lastQualifiedDate: daysAgoIst(1), milestonesAwarded: [1, 7], updatedAt: now });
  put(`studyPlans/${uid}`, { uid, minutesPerDay: 120, examDate: "2027-03-01", subjects: ["mathematics", "physics", "chemistry"], allocation: allocation(120), focusTopicIds: [MAIN_QUADRATIC_TOPIC, "9-physics-motion-equations-of-motion"], updatedAt: now });

  const quizIds = ["10-mathematics-real-numbers-euclids-division-lemma-quiz", "10-mathematics-real-numbers-fundamental-theorem-of-arithmetic-quiz", `${MAIN_QUADRATIC_TOPIC}-quiz`];
  const keyById = new Map(questions.map((entry) => [entry.key.id, entry.key]));
  quizIds.forEach((quizId, index) => {
    const quiz = quizzes.find((item) => item.id === quizId);
    if (!quiz) throw new Error(`Demo seed references unknown quiz ${quizId}`);
    const answers: Record<string, number> = {};
    const results: Record<string, { correctIndex: number; explanation: string; correct: boolean }> = {};
    let score = 0;
    quiz.questionIds.forEach((questionId, questionIndex) => {
      const key = keyById.get(questionId);
      if (!key) throw new Error(`Demo seed references unknown question ${questionId}`);
      const correct = index < 2 ? questionIndex !== 3 : questionIndex % 2 === 0;
      answers[questionId] = correct ? key.correctIndex : (key.correctIndex + 1) % 4;
      results[questionId] = { correctIndex: key.correctIndex, explanation: key.explanation, correct };
      if (correct) score += 1;
    });
    const attemptId = `seed_${uid}_quiz${index}`;
    put(`quizAttempts/${attemptId}`, { id: attemptId, userId: uid, quizId, answers, finalized: true, score, total: quiz.questionIds.length, results, createdAt: ago((3 - index) * DAY), finalizedAt: ago((3 - index) * DAY) });
    put(`quizCompletions/${uid}_${quizId}`, { userId: uid, quizId, attemptId, score, total: quiz.questionIds.length, createdAt: now });
  });
  const attemptRows: [string, string, boolean, string | null][] = [[`${MAIN_QUADRATIC_TOPIC}-p1`, "2, 3", true, null], [`${MAIN_QUADRATIC_TOPIC}-p4`, "3, 1", false, "concept"], [`${MAIN_QUADRATIC_TOPIC}-p5`, "1, 1/3", false, "sign"]];
  attemptRows.forEach(([problemId, finalAnswer, correct, mistakeType], index) => {
    const attemptId = `seed_${uid}_attempt${index}`;
    put(`problemAttempts/${attemptId}`, { id: attemptId, userId: uid, problemId, topicId: MAIN_QUADRATIC_TOPIC, subjectId: "mathematics", level: index === 0 ? 1 : 2, finalAnswer, steps: {}, timeSpentSec: 180 + index * 60, correct, mistakeType, rewarded: correct, createdAt: ago((3 - index) * 6 * HOUR) });
  });
  for (const badgeId of ["first_module", "problems_10", "streak_7"]) put(`userBadges/${uid}/badges/${badgeId}`, { badgeId, awardedAt: now });
  const notifications: [string, string, string, string][] = [["challenge", "Daily Challenge is ready", "Five questions, ten minutes, XP and Stars.", "/challenges"], ["revision", "Revise Quadratic Equations", "Your accuracy dropped to 54%. A short revision will help.", "/revision"], ["streak", "17-day streak", "Keep your streak alive with one meaningful action today.", "/dashboard"]];
  notifications.forEach(([type, title, body, link], index) => {
    put(`notifications/${uid}/items/seed_${index}`, { id: `seed_${index}`, type, title, body, link, read: false, createdAt: ago(index * HOUR) });
  });
}

function seedDoubts(put: Put): void {
  const uidByEmail = new Map(DEMO_ACCOUNTS.map((account) => [account.email, account.uid]));
  const allUids = DEMO_ACCOUNTS.map((account) => account.uid);
  for (const doubt of doubtsJson as SeedDoubt[]) {
    const authorId = uidByEmail.get(doubt.authorEmail);
    if (!authorId) throw new Error(`Demo seed doubt ${doubt.id} has unknown author ${doubt.authorEmail}`);
    const answerVotes = doubt.answers.reduce((sum, answer) => sum + answer.voteCount, 0);
    put(`doubts/${doubt.id}`, {
      id: doubt.id, authorId, authorName: anonUsername(authorId), subjectId: doubt.subjectId, chapterId: doubt.chapterId, topicId: doubt.topicId,
      title: doubt.title, body: doubt.body, status: doubt.status, hidden: false, answerCount: doubt.answers.length, voteCount: answerVotes,
      contentHash: contentHash(`${doubt.title} ${doubt.body}`), createdAt: ago(2 * DAY)
    });
    for (const answer of doubt.answers) {
      const answerAuthor = uidByEmail.get(answer.authorEmail);
      if (!answerAuthor) throw new Error(`Demo seed answer ${answer.id} has unknown author ${answer.authorEmail}`);
      put(`doubts/${doubt.id}/answers/${answer.id}`, {
        id: answer.id, doubtId: doubt.id, authorId: answerAuthor, authorName: anonUsername(answerAuthor), body: answer.body, voteCount: answer.voteCount,
        hidden: false, contentHash: contentHash(answer.body), createdAt: ago(DAY)
      });
      for (const voterUid of allUids.filter((uid) => uid !== answerAuthor).slice(0, answer.voteCount)) {
        put(`votes/${voterUid}_${answer.id}`, { id: `${voterUid}_${answer.id}`, userId: voterUid, doubtId: doubt.id, answerId: answer.id, createdAt: ago(DAY) });
      }
    }
  }
}

/** Fresh user-data documents: accounts, profiles, Aarav's history and the seeded doubts. */
export function seedUserDocs(): Map<string, DocData> {
  const docs = new Map<string, DocData>();
  const put: Put = (path, data) => docs.set(path, { ...(docs.get(path) ?? {}), ...data });
  const now = Timestamp.now();
  for (const account of DEMO_ACCOUNTS) {
    const { uid, email, name, role, goal, subjects, xp, stars, twinStatus } = account;
    put(`demoAccounts/${uid}`, { uid, email, password: DEMO_PASSWORD, displayName: name, admin: role === "admin" });
    put(`users/${uid}`, {
      uid, email, name, classLevel: 10, board: "CBSE", stream: null, language: "en", subjects, goal, role, xp, stars,
      questionsSolved: 0, modulesCompleted: 0, badgeIds: [], problemsSolved: 0, revisionsCompleted: 0, createdAt: now, updatedAt: now
    });
    put(`publicProfiles/${uid}`, {
      uid, anonUsername: anonUsername(uid), avatar: avatarFor(uid), classLevel: 10, goal, level: 1, subjects,
      progressSummary: { accuracy: 0, questionsSolved: 0, modulesCompleted: 0 }, twinStatus, twinPairId: null, updatedAt: now
    });
    put(`streaks/${uid}`, { uid, current: 0, longest: 0, lastQualifiedDate: null, milestonesAwarded: [], updatedAt: now });
    put(`spinState/${uid}`, { uid, nextSpinAt: null, lastResult: null, totalSpins: 0 });
  }
  seedAarav(put, "demo-aarav");
  put("users/demo-aarav", { xp: 2450, stars: 180, questionsSolved: 63, modulesCompleted: 4, problemsSolved: 12, revisionsCompleted: 3, badgeIds: ["first_module", "problems_10", "streak_7"] });
  put("publicProfiles/demo-aarav", { level: 2, progressSummary: { accuracy: 76, questionsSolved: 63, modulesCompleted: 4 } });
  seedDoubts(put);
  return docs;
}
