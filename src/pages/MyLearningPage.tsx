import { useMemo } from "react";
import { collection, query } from "firebase/firestore";
import { Link } from "react-router-dom";
import { db } from "../lib/firebase";
import { useAuth } from "../context/AuthContext";
import { content, SUBJECT_NAMES, useContent } from "../lib/content";
import { titleCase, timeAgo } from "../lib/format";
import { useQueryOnce } from "../hooks/useFirestore";
import { AsyncState, EmptyState, PageHeader, ProgressBar, Tag } from "../components/ui";
import { LEVEL_NAMES, type ModuleProgressDoc, type TopicProgressDoc } from "../lib/types";

export default function MyLearningPage() {
  const { user } = useAuth();
  const uid = user?.uid ?? "";
  const topics = useContent(() => content.allTopics(), []);
  const modules = useQueryOnce<ModuleProgressDoc>(() => (uid ? query(collection(db, `studentProgress/${uid}/modules`)) : null), [uid]);
  const progress = useQueryOnce<TopicProgressDoc>(() => (uid ? query(collection(db, `studentProgress/${uid}/topics`)) : null), [uid]);
  const topicNames = useMemo(() => new Map((topics.data ?? []).map((topic) => [topic.id, topic.name])), [topics.data]);

  const started = modules.data.filter((item) => item.status === "started");
  const completed = modules.data.filter((item) => item.status === "completed");
  const moduleTitle = (moduleId: string) => titleCase(moduleId.replace(/^.*-m(\d+)$/, "Module $1"));
  const isEmpty = modules.data.length === 0 && progress.data.length === 0;

  return (
    <div>
      <PageHeader title="My Learning" subtitle="Pick up where you left off." action={<Link to="/ncert" className="btn-secondary">Browse NCERT</Link>} />
      <AsyncState loading={modules.loading || progress.loading || topics.loading} error={modules.error ?? progress.error ?? topics.error} onRetry={modules.reload}>
        {isEmpty ? (
          <EmptyState title="No learning yet" body="Open a chapter in the NCERT hub to start your first module." action={<Link to="/ncert" className="btn-primary">Go to NCERT</Link>} />
        ) : (
          <div className="grid gap-4 lg:grid-cols-2">
            <section className="card" aria-labelledby="continue-heading">
              <h2 id="continue-heading" className="font-semibold">Continue learning</h2>
              {started.length === 0 ? (
                <p className="mt-1 text-sm text-ink-500">No modules in progress.</p>
              ) : (
                <ul className="mt-2 space-y-2">
                  {started.map((item) => (
                    <li key={item.moduleId} className="flex items-center justify-between rounded-lg bg-ink-100 p-3 text-sm">
                      <div>
                        <p className="font-medium">{topicNames.get(item.topicId) ?? titleCase(item.topicId)} · {moduleTitle(item.moduleId)}</p>
                        <p className="text-ink-500">Started {timeAgo(item.startedAt)}</p>
                      </div>
                      <Link to={`/learn/module/${item.moduleId}`} className="btn-primary">Continue</Link>
                    </li>
                  ))}
                </ul>
              )}
              <h3 className="mt-5 text-sm font-semibold text-ink-700">Completed ({completed.length})</h3>
              {completed.length === 0 ? (
                <p className="mt-1 text-sm text-ink-500">Nothing completed yet.</p>
              ) : (
                <ul className="mt-2 space-y-1 text-sm">
                  {completed.map((item) => (
                    <li key={item.moduleId} className="flex items-center justify-between">
                      <Link to={`/learn/module/${item.moduleId}`} className="text-brand-700">{topicNames.get(item.topicId) ?? titleCase(item.topicId)} · {moduleTitle(item.moduleId)}</Link>
                      <Tag tone="success">Done</Tag>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section className="card" aria-labelledby="topics-heading">
              <h2 id="topics-heading" className="font-semibold">Topic progress</h2>
              {progress.data.length === 0 ? (
                <p className="mt-1 text-sm text-ink-500">Solve problems or take a quiz to build topic progress.</p>
              ) : (
                <ul className="mt-2 space-y-3">
                  {progress.data.map((item) => (
                    <li key={item.topicId}>
                      <div className="flex items-center justify-between text-sm">
                        <Link to={`/learn/topic/${item.topicId}`} className="font-medium text-brand-700">{topicNames.get(item.topicId) ?? titleCase(item.topicId)}</Link>
                        <span className="text-ink-500">{SUBJECT_NAMES[item.subjectId]} · Level {item.levelUnlocked} {LEVEL_NAMES[item.levelUnlocked]}</span>
                      </div>
                      <ProgressBar value={item.mastery} label={`Mastery · accuracy ${Math.round(item.accuracy)}%`} />
                      <Link to={`/problem-lab?topic=${item.topicId}`} className="mt-1 inline-block text-xs text-brand-700">Practice in Problem Lab</Link>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        )}
      </AsyncState>
    </div>
  );
}
