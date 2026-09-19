import { useEffect, useMemo, useState } from "react";
import { collection, doc, query, serverTimestamp, setDoc } from "firebase/firestore";
import { db } from "../lib/firebase";
import { content, SUBJECT_NAMES, useContent } from "../lib/content";
import { daysBetween, istToday, toDate } from "../lib/format";
import { allocateStudyTime, summarizeProgress, weakTopics } from "../lib/planner";
import { useAuth } from "../context/AuthContext";
import { useAction, useDoc, useQueryOnce } from "../hooks/useFirestore";
import { AsyncState, InlineError, PageHeader, ProgressBar, StatTile } from "../components/ui";
import type { DailyActivityDoc, ModuleProgressDoc, StudyPlanAllocation, StudyPlanDoc, TopicProgressDoc } from "../lib/types";

const ALLOCATION_LABELS: Record<keyof StudyPlanAllocation, string> = {
  learning: "Concept learning",
  problems: "Problem solving",
  revision: "Revision",
  quiz: "Quiz",
  ai: "AI Tutor",
  breaks: "Breaks"
};
const SEQUENCE: (keyof StudyPlanAllocation)[] = ["learning", "problems", "breaks", "revision", "quiz", "ai"];

export default function PlannerPage() {
  const { user, profile } = useAuth();
  const uid = user?.uid ?? "";
  const plan = useDoc<StudyPlanDoc>(uid ? `studyPlans/${uid}` : null);
  const today = useDoc<DailyActivityDoc>(uid ? `dailyActivity/${uid}_${istToday()}` : null);
  const topicProgress = useQueryOnce<TopicProgressDoc>(() => (uid ? query(collection(db, `studentProgress/${uid}/topics`)) : null), [uid]);
  const moduleProgress = useQueryOnce<ModuleProgressDoc>(() => (uid ? query(collection(db, `studentProgress/${uid}/modules`)) : null), [uid]);
  const topics = useContent(() => content.allTopics(), []);
  const totalModules = useContent(async () => {
    const fullTopics = (await content.allTopics()).filter((topic) => topic.hasContent);
    const lists = await Promise.all(fullTopics.map((topic) => content.modules(topic.id)));
    return lists.reduce((sum, list) => sum + list.length, 0);
  }, []);

  const [minutesPerDay, setMinutesPerDay] = useState(120);
  const [examDate, setExamDate] = useState("");
  const [loadedFromPlan, setLoadedFromPlan] = useState(false);
  useEffect(() => {
    if (plan.data && !loadedFromPlan) {
      setMinutesPerDay(plan.data.minutesPerDay);
      setExamDate(plan.data.examDate ?? "");
      setLoadedFromPlan(true);
    }
  }, [plan.data, loadedFromPlan]);

  const topicById = useMemo(() => new Map((topics.data ?? []).map((topic) => [topic.id, topic])), [topics.data]);
  const weak = useMemo(
    () =>
      weakTopics(
        topicProgress.data
          .filter((entry) => topicById.has(entry.topicId))
          .map((entry) => {
            const topic = topicById.get(entry.topicId)!;
            return summarizeProgress(entry, topic.name, SUBJECT_NAMES[topic.subjectId], toDate(entry.lastPracticedAt));
          })
      ),
    [topicProgress.data, topicById]
  );
  const completedModules = moduleProgress.data.filter((entry) => entry.status === "completed").length;
  const pendingModules = Math.max(0, (totalModules.data ?? 0) - completedModules);
  const daysToExam = examDate ? daysBetween(istToday(), examDate) : null;
  const allocation = useMemo(
    () => allocateStudyTime({ minutesPerDay, daysToExam, weakTopicCount: weak.length, pendingModuleCount: pendingModules }),
    [minutesPerDay, daysToExam, weak.length, pendingModules]
  );

  const save = useAction(async () => {
    if (!uid) return null;
    await setDoc(doc(db, "studyPlans", uid), {
      uid,
      minutesPerDay,
      examDate: examDate || null,
      subjects: profile?.subjects ?? [],
      allocation,
      focusTopicIds: weak.slice(0, 20).map((summary) => summary.topicId),
      updatedAt: serverTimestamp()
    });
    return true;
  });
  const [saved, setSaved] = useState(false);

  const loading = plan.loading || topicProgress.loading || moduleProgress.loading || topics.loading || totalModules.loading;
  const error = plan.error || topicProgress.error || moduleProgress.error || topics.error || totalModules.error;

  return (
    <div>
      <PageHeader title="Smart Study Planner" subtitle="Tell the planner how much time you have. It splits the day across learning, problems, revision, quizzes and AI help, and tilts toward what you are weak in." />
      <AsyncState loading={loading} error={error} loadingLabel="Loading your plan..." onRetry={plan.reload}>
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.5fr)]">
          <section className="card space-y-4">
            <div>
              <label htmlFor="plan-minutes" className="label">Available time per day: {minutesPerDay} min</label>
              <input id="plan-minutes" type="range" min={15} max={720} step={5} className="w-full" value={minutesPerDay} onChange={(event) => setMinutesPerDay(Number(event.target.value))} />
              <input type="number" min={15} max={720} className="input mt-2" aria-label="Minutes per day" value={minutesPerDay} onChange={(event) => setMinutesPerDay(Math.min(720, Math.max(15, Number(event.target.value) || 15)))} />
            </div>
            <div>
              <label htmlFor="plan-exam" className="label">Exam date (optional)</label>
              <input id="plan-exam" type="date" className="input" value={examDate} onChange={(event) => setExamDate(event.target.value)} />
              {daysToExam !== null && <p className="mt-1 text-xs text-ink-500">{daysToExam > 0 ? `${daysToExam} days to go` : "Exam date has passed"}</p>}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <StatTile label="Weak topics" value={weak.length} />
              <StatTile label="Pending modules" value={pendingModules} />
              <StatTile label="Subjects" value={(profile?.subjects ?? []).length} hint={(profile?.subjects ?? []).map((subject) => SUBJECT_NAMES[subject]).join(", ")} />
              <StatTile label="Today so far" value={`${today.data?.minutes ?? 0} min`} hint={`Target ${minutesPerDay} min`} />
            </div>
            <button
              type="button"
              className="btn-primary w-full"
              disabled={save.busy}
              onClick={async () => {
                const ok = await save.run();
                if (ok) setSaved(true);
              }}
            >
              {save.busy ? "Saving..." : "Save plan"}
            </button>
            <InlineError message={save.error} />
            {saved && !save.error && <p className="text-sm text-success-500" role="status">Plan saved. Your dashboard target is updated.</p>}
          </section>

          <section className="space-y-4">
            <div className="card space-y-3">
              <p className="font-semibold">Recommended split for {minutesPerDay} minutes</p>
              {(Object.keys(ALLOCATION_LABELS) as (keyof StudyPlanAllocation)[]).map((key) => (
                <div key={key}>
                  <div className="mb-1 flex justify-between text-sm">
                    <span>{ALLOCATION_LABELS[key]}</span>
                    <span className="font-semibold">{allocation[key]} min</span>
                  </div>
                  <ProgressBar value={(allocation[key] / minutesPerDay) * 100} tone={key === "breaks" ? "warn" : "brand"} />
                </div>
              ))}
            </div>
            <div className="card">
              <p className="font-semibold">Suggested daily sequence</p>
              <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm">
                {SEQUENCE.filter((key) => allocation[key] > 0).map((key) => (
                  <li key={key}>
                    {ALLOCATION_LABELS[key]} ({allocation[key]} min)
                    {key === "revision" && weak.length > 0 && <span className="text-ink-500">: focus on {weak.slice(0, 2).map((summary) => summary.topicName).join(" and ")}</span>}
                  </li>
                ))}
              </ol>
              <p className="mt-3 text-xs text-ink-500">The split is deterministic: it moves time toward revision and problems as the exam gets closer, and toward learning when many modules are pending.</p>
            </div>
          </section>
        </div>
      </AsyncState>
    </div>
  );
}
