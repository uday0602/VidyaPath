import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { collection, query } from "firebase/firestore";
import { db } from "../lib/firebase";
import { api, type OutcomeResult } from "../lib/callables";
import { content, SUBJECT_NAMES, useContent } from "../lib/content";
import { newId, toDate } from "../lib/format";
import { summarizeProgress, weakTopics } from "../lib/planner";
import { useAuth } from "../context/AuthContext";
import { useAction, useQueryOnce } from "../hooks/useFirestore";
import { AsyncState, PageHeader, ProgressBar, RewardToast, Tag } from "../components/ui";
import { MISTAKE_LABELS, type TopicDoc, type TopicProgressDoc } from "../lib/types";
import { supabaseService } from "../lib/supabase";

const STALE_DAYS = 5;
const REVISE_TODAY_CAP = 6;

export default function RevisionPage() {
  const { user } = useAuth();
  const topics = useContent(() => content.allTopics(), []);
  const progress = useQueryOnce<TopicProgressDoc>(() => (user ? query(collection(db, `studentProgress/${user.uid}/topics`)) : null), [user?.uid]);
  const [toast, setToast] = useState<OutcomeResult | null>(null);
  const [revisedTopicIds, setRevisedTopicIds] = useState<Set<string>>(new Set());

  // Load revised topics from Supabase / persistent storage on mount
  useEffect(() => {
    if (!user?.uid) return;
    supabaseService.getRevisionList(user.uid).then((list) => {
      setRevisedTopicIds(new Set(list));
    });
  }, [user?.uid]);

  const topicById = useMemo(() => new Map((topics.data ?? []).map((topic) => [topic.id, topic])), [topics.data]);
  const summaries = useMemo(
    () =>
      progress.data
        .filter((entry) => topicById.has(entry.topicId))
        .map((entry) => {
          const topic = topicById.get(entry.topicId)!;
          return summarizeProgress(entry, topic.name, SUBJECT_NAMES[topic.subjectId], toDate(entry.lastPracticedAt));
        }),
    [progress.data, topicById]
  );
  const weak = useMemo(() => weakTopics(summaries), [summaries]);

  const reviseToday = useMemo(() => {
    const now = Date.now();
    const chosen: string[] = [];
    const add = (topicId: string) => {
      if (!chosen.includes(topicId) && topicById.get(topicId)?.revision) chosen.push(topicId);
    };
    weak.forEach((summary) => add(summary.topicId));
    summaries
      .filter((summary) => summary.lastPracticedAt && now - summary.lastPracticedAt.getTime() > STALE_DAYS * 86_400_000)
      .sort((left, right) => (left.lastPracticedAt?.getTime() ?? 0) - (right.lastPracticedAt?.getTime() ?? 0))
      .forEach((summary) => add(summary.topicId));
    const started = new Set(progress.data.map((entry) => entry.topicId));
    (topics.data ?? []).filter((topic) => topic.hasContent && !started.has(topic.id)).forEach((topic) => add(topic.id));
    return chosen.slice(0, REVISE_TODAY_CAP).map((topicId) => topicById.get(topicId)!);
  }, [weak, summaries, progress.data, topics.data, topicById]);

  // Overall Revision stats
  const totalEligible = reviseToday.length;
  const completedCount = reviseToday.filter((t) => revisedTopicIds.has(t.id)).length;
  const completionPercent = totalEligible > 0 ? Math.round((completedCount / totalEligible) * 100) : 0;

  const handleMarked = (topicId: string, chapterId: string, result?: OutcomeResult) => {
    setRevisedTopicIds((prev) => new Set([...prev, topicId]));
    if (user?.uid) {
      supabaseService.markTopicRevised(user.uid, topicId, chapterId);
    }
    if (result) setToast(result);
  };

  return (
    <div>
      <PageHeader
        title="Revision Mastery"
        subtitle="Quick concept flashcards and problem traps. Every revised topic is saved immediately to Supabase and tracked towards your chapter completion."
      />

      {/* Progress & Chapter Completion Header */}
      <section className="card mb-6 border border-brand-200 bg-brand-50/50 p-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h3 className="font-semibold text-ink-900">Today's Revision Completion</h3>
            <p className="text-sm text-ink-600">
              {completedCount} of {totalEligible} topics revised today ({completionPercent}%)
            </p>
          </div>
          <div className="flex items-center gap-3">
            <span className="rounded-full bg-brand-100 px-3 py-1 text-sm font-bold text-brand-700">
              {completionPercent}% Done
            </span>
          </div>
        </div>
        <div className="mt-3">
          <ProgressBar label="Revision Progress" value={completionPercent} />
        </div>
      </section>

      <AsyncState loading={topics.loading || progress.loading} error={topics.error || progress.error} loadingLabel="Finding what to revise...">
        <section className="mb-8">
          <h2 className="mb-3 text-lg font-semibold">My Weak Topics</h2>
          {weak.length === 0 ? (
            <div className="card text-sm text-ink-500">No weak topics yet. Solve a few problems in the Problem Lab and this list fills in automatically.</div>
          ) : (
            <ul className="grid gap-3 md:grid-cols-2">
              {weak.map((summary) => (
                <li key={summary.topicId} className="card">
                  <p className="font-semibold">{summary.topicName}</p>
                  <p className="text-sm text-ink-500">{summary.subjectName} · Accuracy {Math.round(summary.accuracy)}%</p>
                  {summary.mainMistake && <p className="mt-1 text-sm">Main issue: <Tag tone="warn">{MISTAKE_LABELS[summary.mainMistake]}</Tag></p>}
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Link to={`/problem-lab?topic=${summary.topicId}&level=1`} className="btn-primary">Practise Level 1</Link>
                    <Link to={`/learn/topic/${summary.topicId}`} className="btn-secondary">Open topic</Link>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-lg font-semibold">Revise Today</h2>
            <span className="text-xs text-ink-500">Synced to Supabase · Restored on refresh</span>
          </div>
          {reviseToday.length === 0 ? (
            <div className="card text-sm text-ink-500">Nothing queued for today. Start a topic from the <Link to="/ncert" className="text-brand-600">NCERT hub</Link> to build your revision list.</div>
          ) : (
            <ul className="grid gap-3 md:grid-cols-2">
              {reviseToday.map((topic) => (
                <RevisionCard
                  key={topic.id}
                  topic={topic}
                  isRevised={revisedTopicIds.has(topic.id)}
                  onMarked={(res) => handleMarked(topic.id, topic.chapterId, res)}
                />
              ))}
            </ul>
          )}
        </section>
      </AsyncState>
      <RewardToast result={toast} onDone={() => setToast(null)} />
    </div>
  );
}

function RevisionCard({
  topic,
  isRevised,
  onMarked
}: {
  topic: TopicDoc;
  isRevised: boolean;
  onMarked: (result?: OutcomeResult) => void;
}) {
  const [showAnswer, setShowAnswer] = useState(false);
  const record = useAction(api.recordStudySession);
  const revision = topic.revision!;

  const markRevised = async () => {
    try {
      const response = await record.run({ sessionId: newId(), topicId: topic.id, minutes: 5, kind: "revision" });
      onMarked(response?.rewards);
    } catch {
      onMarked();
    }
  };

  return (
    <li className={`card space-y-2 text-sm transition-colors ${isRevised ? "border-brand-300 bg-brand-50/20" : ""}`}>
      <div className="flex items-center justify-between">
        <p className="font-semibold">{topic.name}</p>
        {isRevised && <span className="rounded-full bg-success-100 px-2 py-0.5 text-xs font-semibold text-success-800">Revised today ✓</span>}
      </div>
      <p><span className="font-medium">Concept:</span> {revision.concept}</p>
      {revision.formula && <p><span className="font-medium">Formula:</span> <code className="rounded bg-ink-100 px-1">{revision.formula}</code></p>}
      <p><span className="font-medium">Common mistake:</span> {revision.commonMistake}</p>
      <div className="rounded-lg bg-brand-50 p-3">
        <p><span className="font-medium">Quick question:</span> {revision.miniQuestion.question}</p>
        {showAnswer ? (
          <p className="mt-1 font-medium text-brand-700">Answer: {revision.miniQuestion.answer}</p>
        ) : (
          <button type="button" className="btn-ghost mt-1 px-2 py-1" onClick={() => setShowAnswer(true)}>Show answer</button>
        )}
      </div>
      <div className="flex flex-wrap gap-2 pt-1">
        <button
          type="button"
          className={isRevised ? "rounded-lg border border-success-300 bg-success-50 px-3 py-1.5 text-xs font-semibold text-success-800" : "btn-primary"}
          disabled={isRevised || record.busy}
          onClick={markRevised}
        >
          {isRevised ? "✓ Revised" : record.busy ? "Saving..." : "Mark as revised"}
        </button>
        <Link to={`/problem-lab?topic=${topic.id}&level=1`} className="btn-secondary">Practise Level 1</Link>
        <Link to={`/learn/topic/${topic.id}`} className="btn-ghost">Open topic</Link>
      </div>
      {record.error && <p className="text-danger-500" role="alert">{record.error}</p>}
    </li>
  );
}
