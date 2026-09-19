// Shared data model. A copy of this file lives at functions/src/types.ts so the
// Functions package deploys self-contained. Keep both in sync.

export type ClassLevel = 9 | 10 | 11 | 12;
export type Board = "CBSE" | "ICSE" | "State";
export type Stream = "PCM" | "PCB" | "PCMB";
export type Goal = "board" | "jee" | "neet" | "board_jee" | "board_neet";
export type SubjectId =
  | "mathematics"
  | "physics"
  | "chemistry"
  | "biology"
  | "science"
  | "social_science"
  | "english";
export type ExamType = "board" | "jee" | "neet" | "mixed";
export type Level = 1 | 2 | 3 | 4 | 5;
export type Role = "student" | "admin";
export type Language = "en" | "hi";
export type MistakeType =
  | "concept"
  | "formula"
  | "calculation"
  | "unit"
  | "sign"
  | "misread"
  | "reasoning"
  | "time";
export type Framework = "physics" | "physical_chemistry" | "organic_chemistry" | "inorganic_chemistry" | "mathematics";
export type AiMode =
  | "hint"
  | "identify_concept"
  | "guide"
  | "check_approach"
  | "find_mistake"
  | "full_explanation"
  | "explain"
  | "solve_with_me"
  | "generate_questions"
  | "check_answer"
  | "revision"
  | "exam";
export type AiSource = "gemini" | "fallback";

export const GOAL_LABELS: Record<Goal, string> = {
  board: "Board",
  jee: "JEE Foundation",
  neet: "NEET Foundation",
  board_jee: "Board + JEE Foundation",
  board_neet: "Board + NEET Foundation"
};

export const LEVEL_NAMES: Record<Level, string> = {
  1: "Starter",
  2: "Concept Builder",
  3: "Application",
  4: "Competitive",
  5: "Master"
};

export const MISTAKE_LABELS: Record<MistakeType, string> = {
  concept: "Concept Error",
  formula: "Formula Selection Error",
  calculation: "Calculation Error",
  unit: "Unit Error",
  sign: "Sign Convention Error",
  misread: "Misread Question",
  reasoning: "Logical Reasoning Error",
  time: "Time Management"
};

export interface UserDoc {
  uid: string;
  email: string;
  name: string;
  classLevel: ClassLevel;
  board: Board;
  stream: Stream | null;
  language: Language;
  subjects: SubjectId[];
  goal: Goal;
  role: Role;
  xp: number;
  stars: number;
  questionsSolved: number;
  modulesCompleted: number;
  createdAt: unknown;
  updatedAt: unknown;
}

export interface PublicProfile {
  uid: string;
  anonUsername: string;
  avatar: string;
  classLevel: ClassLevel;
  goal: Goal;
  level: Level;
  subjects: SubjectId[];
  progressSummary: { accuracy: number; questionsSolved: number; modulesCompleted: number };
  twinStatus: "none" | "searching" | "matched";
  twinPairId: string | null;
  updatedAt: unknown;
}

export interface SubjectDoc {
  id: SubjectId;
  name: string;
  classLevels: ClassLevel[];
  order: number;
}

export interface ChapterDoc {
  id: string;
  subjectId: SubjectId;
  classLevel: ClassLevel;
  name: string;
  order: number;
  sampleOnly: boolean;
  examTags: ExamType[];
}

export interface TopicDoc {
  id: string;
  chapterId: string;
  subjectId: SubjectId;
  classLevel: ClassLevel;
  name: string;
  order: number;
  hasContent: boolean;
  concept: string;
  keyPoints: string[];
  formulae: string[];
  examples: { problem: string; solution: string }[];
  commonMistakes: string[];
  revision: { concept: string; formula: string; commonMistake: string; miniQuestion: { question: string; answer: string } } | null;
  quizId: string | null;
}

export interface ModuleContentBlock {
  type: "text" | "keypoints" | "formula" | "example";
  heading: string;
  body: string;
}

export interface ModuleDoc {
  id: string;
  topicId: string;
  chapterId: string;
  subjectId: SubjectId;
  classLevel: ClassLevel;
  title: string;
  description: string;
  estimatedMinutes: number;
  order: number;
  blocks: ModuleContentBlock[];
}

export interface QuestionDoc {
  id: string;
  topicId: string;
  subjectId: SubjectId;
  classLevel: ClassLevel;
  level: Level;
  text: string;
  options: string[];
}

export interface QuestionKeyDoc {
  id: string;
  correctIndex: number;
  explanation: string;
}

export interface QuizDoc {
  id: string;
  title: string;
  topicId: string;
  subjectId: SubjectId;
  classLevel: ClassLevel;
  level: Level;
  questionIds: string[];
  timeLimitSec: number;
}

export interface QuizAttemptDoc {
  id: string;
  userId: string;
  quizId: string;
  answers: Record<string, number>;
  finalized: boolean;
  score: number | null;
  total: number | null;
  results: Record<string, { correctIndex: number; explanation: string; correct: boolean }> | null;
  createdAt: unknown;
  finalizedAt: unknown;
}

export interface ProblemDoc {
  id: string;
  topicId: string;
  chapterId: string;
  subjectId: SubjectId;
  classLevel: ClassLevel;
  level: Level;
  examTypes: ExamType[];
  framework: Framework;
  title: string;
  statement: string;
  concept: string;
  expectedMinutes: number;
  marks: number;
  hints: string[];
  answerType: "numeric" | "text";
  answerUnit: string | null;
  similarProblemIds: string[];
}

export interface ProblemSolutionDoc {
  id: string;
  finalAnswer: string;
  numericAnswer: number | null;
  tolerance: number;
  acceptedAnswers: string[];
  steps: { label: string; content: string }[];
  commonMistakes: { type: MistakeType; description: string; matchAnswers: string[] }[];
  coach: {
    hint: string;
    concept: string;
    guide: string;
    checkApproach: string;
    findMistake: string;
    fullExplanation: string;
  };
}

export interface ProblemAttemptDoc {
  id: string;
  userId: string;
  problemId: string;
  topicId: string;
  subjectId: SubjectId;
  level: Level;
  finalAnswer: string;
  steps: Record<string, string>;
  timeSpentSec: number;
  correct: boolean;
  mistakeType: MistakeType | null;
  rewarded: boolean;
  createdAt: unknown;
}

export interface MistakeDoc {
  id: string;
  userId: string;
  problemId: string | null;
  questionId: string | null;
  topicId: string;
  subjectId: SubjectId;
  type: MistakeType;
  note: string;
  createdAt: unknown;
}

export interface TopicProgressDoc {
  topicId: string;
  chapterId: string;
  subjectId: SubjectId;
  classLevel: ClassLevel;
  levelUnlocked: Level;
  attempts: number;
  correct: number;
  accuracy: number;
  solvedProblemIds: string[];
  revealedProblemIds: string[];
  levelStats: Record<string, { attempts: number; correct: number }>;
  adaptive: { consecutiveCorrect: number; consecutiveWrong: number; suggestedLevel: Level };
  mistakeCounts: Partial<Record<MistakeType, number>>;
  mastery: number;
  lastPracticedAt: unknown;
}

export interface ModuleProgressDoc {
  moduleId: string;
  topicId: string;
  subjectId: SubjectId;
  status: "started" | "completed";
  startedAt: unknown;
  completedAt: unknown;
}

export interface StreakDoc {
  uid: string;
  current: number;
  longest: number;
  lastQualifiedDate: string | null;
  milestonesAwarded: number[];
  updatedAt: unknown;
}

export interface DailyActivityDoc {
  uid: string;
  date: string;
  minutes: number;
  questions: number;
  modules: number;
  revisions: number;
  qualified: boolean;
  updatedAt: unknown;
}

export interface LedgerTransactionDoc {
  id: string;
  userId: string;
  amount: number;
  reason: string;
  refId: string;
  createdAt: unknown;
}

export interface RewardDoc {
  id: string;
  name: string;
  description: string;
  starsRequired: number;
  available: boolean;
  oncePerUser: boolean;
  kind: "physical" | "digital";
  prototype: boolean;
  order: number;
}

export interface RewardClaimDoc {
  id: string;
  userId: string;
  rewardId: string;
  rewardName: string;
  starsSpent: number;
  type: "store" | "goodie100";
  status: "pending" | "approved" | "fulfilled" | "rejected";
  createdAt: unknown;
}

export interface SpinOutcome {
  label: string;
  weight: number;
  xp: number;
  stars: number;
  badgeId: string | null;
}

export interface SpinStateDoc {
  uid: string;
  nextSpinAt: unknown;
  lastResult: string | null;
  totalSpins: number;
}

export interface SpinHistoryDoc {
  id: string;
  userId: string;
  result: string;
  xp: number;
  stars: number;
  createdAt: unknown;
}

export interface DailyChallengeDoc {
  id: string;
  title: string;
  questionIds: string[];
  timeLimitSec: number;
  classLevel: ClassLevel | null;
  order: number;
}

export interface ChallengeCompletionDoc {
  id: string;
  userId: string;
  challengeId: string;
  date: string;
  score: number;
  total: number;
  createdAt: unknown;
}

export interface DoubtDoc {
  id: string;
  authorId: string;
  authorName: string;
  subjectId: SubjectId;
  chapterId: string | null;
  topicId: string | null;
  title: string;
  body: string;
  status: "open" | "answered" | "resolved";
  hidden: boolean;
  answerCount: number;
  voteCount: number;
  contentHash: string;
  createdAt: unknown;
}

export interface DoubtAnswerDoc {
  id: string;
  doubtId: string;
  authorId: string;
  authorName: string;
  body: string;
  voteCount: number;
  hidden: boolean;
  contentHash: string;
  createdAt: unknown;
}

export interface VoteDoc {
  id: string;
  userId: string;
  doubtId: string;
  answerId: string;
  createdAt: unknown;
}

export type ReportReason = "spam" | "abuse" | "irrelevant" | "inappropriate" | "harassment" | "other";

export interface ReportDoc {
  id: string;
  reporterId: string;
  targetType: "doubt" | "answer" | "user";
  targetId: string;
  doubtId: string | null;
  reason: ReportReason;
  details: string;
  status: "open" | "resolved" | "dismissed";
  createdAt: unknown;
}

export interface BlockDoc {
  blockedUid: string;
  createdAt: unknown;
}

export interface StudyTwinPairDoc {
  id: string;
  members: string[];
  classLevel: ClassLevel;
  goal: Goal;
  status: "active";
  createdAt: unknown;
}

export interface TwinChallengeDoc {
  id: string;
  pairId: string;
  members: string[];
  questionIds: string[];
  results: Record<string, { score: number; total: number; completedAt: unknown }>;
  createdAt: unknown;
}

export interface AiMessageDoc {
  id: string;
  role: "user" | "assistant";
  mode: AiMode;
  text: string;
  source: AiSource | null;
  createdAt: unknown;
}

export interface NotificationDoc {
  id: string;
  type: "challenge" | "streak" | "revision" | "reward" | "twin" | "doubt";
  title: string;
  body: string;
  link: string | null;
  read: boolean;
  createdAt: unknown;
}

export interface StudyPlanAllocation {
  learning: number;
  problems: number;
  revision: number;
  quiz: number;
  ai: number;
  breaks: number;
}

export interface StudyPlanDoc {
  uid: string;
  minutesPerDay: number;
  examDate: string | null;
  subjects: SubjectId[];
  allocation: StudyPlanAllocation;
  focusTopicIds: string[];
  updatedAt: unknown;
}

export interface CareerPathDoc {
  id: string;
  name: string;
  summary: string;
  subjects: string[];
  skills: string[];
  entranceRoutes: string[];
  exampleCareers: string[];
  preparation: string[];
  order: number;
}

export interface BadgeDoc {
  id: string;
  name: string;
  description: string;
  icon: string;
}

export interface RewardConfig {
  moduleXp: number;
  quizXpPerQuestion: number;
  quizStarsPerCorrect: number;
  problemXpByLevel: Record<string, number>;
  problemStarsByLevel: Record<string, number>;
  challengeXp: number;
  challengeStars: number;
  revisionXp: number;
  studyMinuteXp: number;
  streakDayMinutes: number;
  streakDayQuestions: number;
  unlockThresholds: number[];
  spinCooldownHours: number;
  spinOutcomes: SpinOutcome[];
  aiDailyLimit: number;
  doubtCooldownSec: number;
  answerCooldownSec: number;
  streakMilestones: number[];
}
