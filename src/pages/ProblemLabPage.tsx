import { useMemo } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { collection, query } from "firebase/firestore";
import { db } from "../lib/firebase";
import { content, SUBJECT_NAMES, useContent } from "../lib/content";
import { useAuth } from "../context/AuthContext";
import { useQueryOnce } from "../hooks/useFirestore";
import { AsyncState, PageHeader, Tag } from "../components/ui";
import { LEVEL_NAMES, type ClassLevel, type ExamType, type Level, type ProblemDoc, type SubjectId, type TopicProgressDoc } from "../lib/types";

const LEVELS: Level[] = [1, 2, 3, 4, 5];
const EXAMS: ExamType[] = ["board", "jee", "neet", "mixed"];
const SUBJECT_OPTIONS: SubjectId[] = ["mathematics", "physics", "chemistry", "biology"];
const UNLOCK_RULE: Record<number, string> = { 2: "80% on Level 1", 3: "75% on Level 2", 4: "70% on Level 3", 5: "70% on Level 4" };

export default function ProblemLabPage() {
  const { user, profile } = useAuth();
  const [params, setParams] = useSearchParams();
  const classLevel = (Number(params.get("class")) || profile?.classLevel || 10) as ClassLevel;
  const subjectId = (params.get("subject") || profile?.subjects?.[0] || "mathematics") as SubjectId;
  const chapterId = params.get("chapter") ?? "";
  const topicId = params.get("topic") ?? "";
  const level = Number(params.get("level")) || 0;
  const exam = params.get("exam") ?? "";
  const status = params.get("status") ?? "";

  const setParam = (key: string, value: string) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    if (key === "subject" || key === "class") {
      next.delete("chapter");
      next.delete("topic");
    }
    if (key === "chapter") next.delete("topic");
    setParams(next);
  };

  const topics = useContent(() => content.allTopics(), []);
  const chapters = useContent(() => content.allChapters(), []);
  const problems = useContent(
    () => (topicId ? content.problemsForTopic(topicId) : content.problemsForClassSubject(classLevel, subjectId)),
    [topicId, classLevel, subjectId]
  );
  const progress = useQueryOnce<TopicProgressDoc>(() => (user ? query(collection(db, `studentProgress/${user.uid}/topics`)) : null), [user?.uid]);

  const progressByTopic = useMemo(() => new Map(progress.data.map((entry) => [entry.topicId, entry])), [progress.data]);
  const topicName = useMemo(() => new Map((topics.data ?? []).map((topic) => [topic.id, topic.name])), [topics.data]);
  const chapterOptions = useMemo(
    () => (chapters.data ?? []).filter((chapter) => chapter.classLevel === classLevel && chapter.subjectId === subjectId && !chapter.sampleOnly),
    [chapters.data, classLevel, subjectId]
  );
  const topicOptions = useMemo(() => (topics.data ?? []).filter((topic) => topic.chapterId === chapterId), [topics.data, chapterId]);

  const visible = useMemo(() => {
    return (problems.data ?? []).filter((problem) => {
      if (chapterId && problem.chapterId !== chapterId) return false;
      if (level && problem.level !== level) return false;
      if (exam && !problem.examTypes.includes(exam as ExamType) && !problem.examTypes.includes("mixed")) return false;
      const solved = progressByTopic.get(problem.topicId)?.solvedProblemIds.includes(problem.id) ?? false;
      if (status === "solved" && !solved) return false;
      if (status === "unsolved" && solved) return false;
      return true;
    });
  }, [problems.data, chapterId, level, exam, status, progressByTopic]);

  const suggestedLevel = topicId ? progressByTopic.get(topicId)?.adaptive.suggestedLevel : undefined;
  const loading = topics.loading || chapters.loading || problems.loading || progress.loading;
  const error = topics.error || chapters.error || problems.error || progress.error;

  return (
    <div>
      <PageHeader
        title="Problem Lab"
        subtitle="The core learning engine. Every problem trains one question: how should I approach this? Move step by step, get guided by the AI coach, and learn from each mistake."
      />
      <div className="card mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <FilterSelect label="Class" value={String(classLevel)} onChange={(value) => setParam("class", value)} options={[9, 10, 11, 12].map((item) => [String(item), `Class ${item}`])} />
        <FilterSelect label="Subject" value={subjectId} onChange={(value) => setParam("subject", value)} options={SUBJECT_OPTIONS.map((item) => [item, SUBJECT_NAMES[item]])} />
        <FilterSelect label="Chapter" value={chapterId} onChange={(value) => setParam("chapter", value)} options={[["", "All chapters"], ...chapterOptions.map((chapter) => [chapter.id, chapter.name] as [string, string])]} />
        <FilterSelect label="Topic" value={topicId} onChange={(value) => setParam("topic", value)} options={[["", "All topics"], ...topicOptions.map((topic) => [topic.id, topic.name] as [string, string])]} />
        <FilterSelect label="Level" value={level ? String(level) : ""} onChange={(value) => setParam("level", value)} options={[["", "All levels"], ...LEVELS.map((item) => [String(item), `Level ${item}: ${LEVEL_NAMES[item]}`] as [string, string])]} />
        <FilterSelect label="Exam" value={exam} onChange={(value) => setParam("exam", value)} options={[["", "All exams"], ...EXAMS.map((item) => [item, item === "jee" ? "JEE Foundation" : item === "neet" ? "NEET Foundation" : item === "board" ? "Board" : "Mixed"] as [string, string])]} />
        <FilterSelect label="Status" value={status} onChange={(value) => setParam("status", value)} options={[["", "All"], ["unsolved", "Unsolved"], ["solved", "Solved"]]} />
        {suggestedLevel && (
          <div className="flex items-end">
            <Tag tone="brand">Recommended for you: Level {suggestedLevel}</Tag>
          </div>
        )}
      </div>

      <AsyncState
        loading={loading}
        error={error}
        empty={visible.length === 0}
        loadingLabel="Loading problems..."
        emptyTitle="No problems match these filters"
        emptyBody="Try another topic or level. Full problem sets exist for Class 10 Mathematics, Class 9 Motion and Class 10 Chemical Reactions."
      >
        <ul className="space-y-3">
          {visible.map((problem) => (
            <ProblemRow key={problem.id} problem={problem} topicName={topicName.get(problem.topicId) ?? problem.topicId} progress={progressByTopic.get(problem.topicId)} />
          ))}
        </ul>
      </AsyncState>
    </div>
  );
}

function FilterSelect({ label, value, onChange, options }: { label: string; value: string; onChange: (value: string) => void; options: [string, string][] }) {
  const id = `filter-${label.toLowerCase()}`;
  return (
    <div>
      <label htmlFor={id} className="label">{label}</label>
      <select id={id} className="input" value={value} onChange={(event) => onChange(event.target.value)}>
        {options.map(([optionValue, optionLabel]) => (
          <option key={optionValue} value={optionValue}>{optionLabel}</option>
        ))}
      </select>
    </div>
  );
}

function ProblemRow({ problem, topicName, progress }: { problem: ProblemDoc; topicName: string; progress: TopicProgressDoc | undefined }) {
  const unlocked = progress?.levelUnlocked ?? 1;
  const locked = problem.level > unlocked;
  const solved = progress?.solvedProblemIds.includes(problem.id) ?? false;
  const body = (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <p className="font-semibold text-ink-900">{locked ? "🔒 " : ""}{problem.title}</p>
        <p className="mt-1 text-sm text-ink-500">{topicName} · Level {problem.level}: {LEVEL_NAMES[problem.level]} · {problem.expectedMinutes} min · {problem.marks} marks</p>
        {locked && <p className="mt-1 text-xs text-warn-500">Locked. Unlock with {UNLOCK_RULE[problem.level]}.</p>}
      </div>
      <div className="flex flex-wrap gap-1">
        {problem.examTypes.map((examType) => (
          <Tag key={examType}>{examType.toUpperCase()}</Tag>
        ))}
        {solved && <Tag tone="success">Solved</Tag>}
      </div>
    </div>
  );
  if (locked) return <li className="card opacity-70">{body}</li>;
  return (
    <li>
      <Link to={`/problem-lab/${problem.id}`} className="card block hover:border-brand-500">{body}</Link>
    </li>
  );
}
