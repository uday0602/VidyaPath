import { useEffect, useRef } from "react";
import { collection, query, where } from "firebase/firestore";
import { Link, useParams } from "react-router-dom";
import { db } from "../lib/firebase";
import { useAuth } from "../context/AuthContext";
import { api } from "../lib/callables";
import { content, SUBJECT_NAMES, useContent } from "../lib/content";
import { newId } from "../lib/format";
import { useDoc, useQueryOnce } from "../hooks/useFirestore";
import { AsyncState, PageHeader, Tag } from "../components/ui";
import { LEVEL_NAMES, type Level, type ModuleProgressDoc, type TopicProgressDoc } from "../lib/types";

const LEVELS: Level[] = [1, 2, 3, 4, 5];

export default function TopicPage() {
  const { topicId = "" } = useParams<{ topicId: string }>();
  const { user } = useAuth();
  const uid = user?.uid ?? "";
  const topic = useContent(() => content.topic(topicId), [topicId]);
  const modules = useContent(() => content.modules(topicId), [topicId]);
  const moduleProgress = useQueryOnce<ModuleProgressDoc>(() => (uid ? query(collection(db, `studentProgress/${uid}/modules`), where("topicId", "==", topicId)) : null), [uid, topicId]);
  const topicProgress = useDoc<TopicProgressDoc>(uid ? `studentProgress/${uid}/topics/${topicId}` : null);
  const startedAt = useRef(Date.now());

  useEffect(() => {
    startedAt.current = Date.now();
    return () => {
      const elapsedSeconds = (Date.now() - startedAt.current) / 1000;
      if (elapsedSeconds < 60 || !topicId) return;
      api.recordStudySession({ sessionId: newId(), topicId, minutes: Math.max(1, Math.round(elapsedSeconds / 60)), kind: "learning" }).catch((error) => console.error("Could not record study session", error));
    };
  }, [topicId]);

  const statusOf = (moduleId: string) => moduleProgress.data.find((item) => item.moduleId === moduleId)?.status ?? null;
  const levelUnlocked = topicProgress.data?.levelUnlocked ?? 1;

  return (
    <AsyncState loading={topic.loading || modules.loading} error={topic.error ?? modules.error} empty={!topic.loading && !topic.data} emptyTitle="Topic not found">
      {topic.data && (
        <div>
          <PageHeader
            title={topic.data.name}
            subtitle={<>{SUBJECT_NAMES[topic.data.subjectId]} · Class {topic.data.classLevel} · <Link to={`/ncert/${topic.data.classLevel}/${topic.data.subjectId}`} className="text-brand-700">Back to chapters</Link></>}
            action={<Link to={`/ai-tutor?topic=${topic.data.id}`} className="btn-secondary">Ask AI Tutor</Link>}
          />
          <div className="grid gap-4 lg:grid-cols-3">
            <div className="space-y-4 lg:col-span-2">
              <section className="card" aria-labelledby="concept-heading">
                <h2 id="concept-heading" className="font-semibold">Concept</h2>
                <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-ink-700">{topic.data.concept}</p>
                {topic.data.keyPoints.length > 0 && (
                  <>
                    <h3 className="mt-4 text-sm font-semibold">Key points</h3>
                    <ul className="mt-1 list-disc space-y-1 pl-5 text-sm text-ink-700">{topic.data.keyPoints.map((point) => <li key={point}>{point}</li>)}</ul>
                  </>
                )}
                {topic.data.formulae.length > 0 && (
                  <>
                    <h3 className="mt-4 text-sm font-semibold">Formulae</h3>
                    <ul className="mt-1 space-y-1 text-sm">{topic.data.formulae.map((formula) => <li key={formula} className="rounded bg-ink-100 px-2 py-1 font-mono">{formula}</li>)}</ul>
                  </>
                )}
              </section>
              {topic.data.examples.length > 0 && (
                <section className="card" aria-labelledby="examples-heading">
                  <h2 id="examples-heading" className="font-semibold">Worked examples</h2>
                  <ol className="mt-2 space-y-3 text-sm">
                    {topic.data.examples.map((example, index) => (
                      <li key={index}>
                        <p className="font-medium">{index + 1}. {example.problem}</p>
                        <details className="mt-1">
                          <summary className="cursor-pointer text-brand-700">Show solution</summary>
                          <p className="mt-1 whitespace-pre-line text-ink-700">{example.solution}</p>
                        </details>
                      </li>
                    ))}
                  </ol>
                </section>
              )}
              {topic.data.commonMistakes.length > 0 && (
                <section className="card" aria-labelledby="mistakes-heading">
                  <h2 id="mistakes-heading" className="font-semibold">Common mistakes</h2>
                  <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-ink-700">{topic.data.commonMistakes.map((mistake) => <li key={mistake}>{mistake}</li>)}</ul>
                </section>
              )}
              {topic.data.revision && (
                <section className="card border-brand-100 bg-brand-50" aria-labelledby="revision-heading">
                  <h2 id="revision-heading" className="font-semibold">Revision card</h2>
                  <dl className="mt-2 grid gap-2 text-sm sm:grid-cols-2">
                    <div><dt className="font-medium">Concept</dt><dd className="text-ink-700">{topic.data.revision.concept}</dd></div>
                    <div><dt className="font-medium">Formula</dt><dd className="font-mono text-ink-700">{topic.data.revision.formula}</dd></div>
                    <div><dt className="font-medium">Common mistake</dt><dd className="text-ink-700">{topic.data.revision.commonMistake}</dd></div>
                    <div>
                      <dt className="font-medium">Mini question</dt>
                      <dd className="text-ink-700">{topic.data.revision.miniQuestion.question}
                        <details><summary className="cursor-pointer text-brand-700">Answer</summary>{topic.data.revision.miniQuestion.answer}</details>
                      </dd>
                    </div>
                  </dl>
                </section>
              )}
            </div>

            <div className="space-y-4">
              <section className="card" aria-labelledby="modules-heading">
                <h2 id="modules-heading" className="font-semibold">Modules</h2>
                {(modules.data ?? []).length === 0 ? (
                  <p className="mt-1 text-sm text-ink-500">No modules for this topic yet.</p>
                ) : (
                  <ul className="mt-2 space-y-2">
                    {(modules.data ?? []).map((module) => {
                      const status = statusOf(module.id);
                      return (
                        <li key={module.id} className="flex items-center justify-between gap-2 text-sm">
                          <Link to={`/learn/module/${module.id}`} className="text-brand-700">{module.title} <span className="text-ink-500">({module.estimatedMinutes} min)</span></Link>
                          {status === "completed" ? <Tag tone="success">Done</Tag> : status === "started" ? <Tag tone="warn">In progress</Tag> : <Tag>New</Tag>}
                        </li>
                      );
                    })}
                  </ul>
                )}
                {topic.data.quizId && <Link to={`/quiz/${topic.data.quizId}`} className="btn-primary mt-3 w-full">Take the topic quiz</Link>}
              </section>

              <section className="card" aria-labelledby="levels-heading">
                <h2 id="levels-heading" className="font-semibold">5-level practice</h2>
                <p className="mt-1 text-xs text-ink-500">Unlock the next level with 80% / 75% / 70% / 70% accuracy on the level before it.</p>
                <ol className="mt-2 space-y-1">
                  {LEVELS.map((level) => {
                    const unlocked = level <= levelUnlocked;
                    return (
                      <li key={level} className={`flex items-center justify-between rounded-lg px-3 py-2 text-sm ${unlocked ? "bg-ink-100" : "bg-ink-100/50 text-ink-500"}`}>
                        <span>Level {level} · {LEVEL_NAMES[level]}</span>
                        {unlocked ? <Link to={`/problem-lab?topic=${topic.data?.id}&level=${level}`} className="text-brand-700">Practice</Link> : <span aria-label="Locked">🔒</span>}
                      </li>
                    );
                  })}
                </ol>
                {topicProgress.data && <p className="mt-2 text-xs text-ink-500">Accuracy {Math.round(topicProgress.data.accuracy)}% over {topicProgress.data.attempts} attempts.</p>}
              </section>
            </div>
          </div>
        </div>
      )}
    </AsyncState>
  );
}
