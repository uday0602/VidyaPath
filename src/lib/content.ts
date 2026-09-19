import { collection, doc, documentId, getDoc, getDocs, orderBy, query, where, type QueryConstraint } from "firebase/firestore";
import { useEffect, useState } from "react";
import { db } from "./firebase";
import { errorMessage } from "./callables";
import type { CareerPathDoc, ChapterDoc, ClassLevel, DailyChallengeDoc, ModuleDoc, ProblemDoc, QuestionDoc, QuizDoc, RewardDoc, SubjectId, SubjectDoc, TopicDoc } from "./types";

// Content collections are static per deploy, so results are memoised for the session.
const cache = new Map<string, Promise<unknown>>();

function cached<T>(key: string, load: () => Promise<T>): Promise<T> {
  if (!cache.has(key)) {
    cache.set(
      key,
      load().catch((error) => {
        cache.delete(key);
        throw error;
      })
    );
  }
  return cache.get(key) as Promise<T>;
}

async function list<T>(path: string, ...constraints: QueryConstraint[]): Promise<T[]> {
  const snapshot = await getDocs(query(collection(db, path), ...constraints));
  return snapshot.docs.map((item) => ({ id: item.id, ...item.data() }) as T);
}

export const content = {
  subjects: () => cached("subjects", () => list<SubjectDoc>("subjects", orderBy("order"))),
  chapters: (classLevel: ClassLevel, subjectId: SubjectId) =>
    cached(`chapters:${classLevel}:${subjectId}`, () => list<ChapterDoc>("chapters", where("classLevel", "==", classLevel), where("subjectId", "==", subjectId), orderBy("order"))),
  topics: (chapterId: string) => cached(`topics:${chapterId}`, () => list<TopicDoc>("topics", where("chapterId", "==", chapterId), orderBy("order"))),
  topic: (topicId: string) => cached(`topic:${topicId}`, async () => {
    const snapshot = await getDoc(doc(db, "topics", topicId));
    return snapshot.exists() ? ({ id: snapshot.id, ...snapshot.data() } as TopicDoc) : null;
  }),
  chapter: (chapterId: string) => cached(`chapter:${chapterId}`, async () => {
    const snapshot = await getDoc(doc(db, "chapters", chapterId));
    return snapshot.exists() ? ({ id: snapshot.id, ...snapshot.data() } as ChapterDoc) : null;
  }),
  modules: (topicId: string) => cached(`modules:${topicId}`, () => list<ModuleDoc>("modules", where("topicId", "==", topicId), orderBy("order"))),
  module: (moduleId: string) => cached(`module:${moduleId}`, async () => {
    const snapshot = await getDoc(doc(db, "modules", moduleId));
    return snapshot.exists() ? ({ id: snapshot.id, ...snapshot.data() } as ModuleDoc) : null;
  }),
  quiz: (quizId: string) => cached(`quiz:${quizId}`, async () => {
    const snapshot = await getDoc(doc(db, "quizzes", quizId));
    return snapshot.exists() ? ({ id: snapshot.id, ...snapshot.data() } as QuizDoc) : null;
  }),
  questions: (ids: string[]) =>
    cached(`questions:${ids.join(",")}`, async () => {
      const chunks: string[][] = [];
      for (let index = 0; index < ids.length; index += 10) chunks.push(ids.slice(index, index + 10));
      const results = await Promise.all(chunks.map((chunk) => list<QuestionDoc>("questions", where(documentId(), "in", chunk))));
      const byId = new Map(results.flat().map((question) => [question.id, question]));
      return ids.map((id) => byId.get(id)).filter((question): question is QuestionDoc => Boolean(question));
    }),
  problem: (problemId: string) => cached(`problem:${problemId}`, async () => {
    const snapshot = await getDoc(doc(db, "problems", problemId));
    return snapshot.exists() ? ({ id: snapshot.id, ...snapshot.data() } as ProblemDoc) : null;
  }),
  problemsForClassSubject: (classLevel: ClassLevel, subjectId: SubjectId) =>
    cached(`problems:${classLevel}:${subjectId}`, () => list<ProblemDoc>("problems", where("classLevel", "==", classLevel), where("subjectId", "==", subjectId), orderBy("level"))),
  problemsForTopic: (topicId: string) => cached(`problems:topic:${topicId}`, () => list<ProblemDoc>("problems", where("topicId", "==", topicId), orderBy("level"))),
  allProblems: () => cached("problems:all", () => list<ProblemDoc>("problems")),
  allTopics: () => cached("topics:all", () => list<TopicDoc>("topics")),
  allChapters: () => cached("chapters:all", () => list<ChapterDoc>("chapters")),
  rewards: () => cached("rewards", () => list<RewardDoc>("rewards", orderBy("order"))),
  challenges: () => cached("challenges", () => list<DailyChallengeDoc>("dailyChallenges", orderBy("order"))),
  careers: () => cached("careers", () => list<CareerPathDoc>("careerPaths", orderBy("order")))
};

/** Run a memoised content loader with loading/error state. */
export function useContent<T>(load: () => Promise<T>, deps: unknown[]): { data: T | null; loading: boolean; error: string | null } {
  const [state, setState] = useState<{ data: T | null; loading: boolean; error: string | null }>({ data: null, loading: true, error: null });
  useEffect(() => {
    let cancelled = false;
    setState((previous) => ({ ...previous, loading: true, error: null }));
    load()
      .then((data) => {
        if (!cancelled) setState({ data, loading: false, error: null });
      })
      .catch((error) => {
        console.error("Content load failed", error);
        if (!cancelled) setState({ data: null, loading: false, error: errorMessage(error) });
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return state;
}

export const SUBJECT_NAMES: Record<SubjectId, string> = {
  mathematics: "Mathematics",
  physics: "Physics",
  chemistry: "Chemistry",
  biology: "Biology",
  science: "Science",
  social_science: "Social Science",
  english: "English"
};
