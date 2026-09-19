import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { api, type OutcomeResult } from "../lib/callables";
import { content, useContent } from "../lib/content";
import { newId } from "../lib/format";
import { useAction, useDoc } from "../hooks/useFirestore";
import { AsyncState, InlineError, PageHeader, RewardToast, Tag } from "../components/ui";
import type { ModuleContentBlock, ModuleProgressDoc } from "../lib/types";

export default function ModulePage() {
  const { moduleId = "" } = useParams<{ moduleId: string }>();
  const { user } = useAuth();
  const uid = user?.uid ?? "";
  const module = useContent(() => content.module(moduleId), [moduleId]);
  const siblings = useContent(() => (module.data ? content.modules(module.data.topicId) : Promise.resolve([])), [module.data?.topicId]);
  const progress = useDoc<ModuleProgressDoc>(uid ? `studentProgress/${uid}/modules/${moduleId}` : null, [moduleId]);
  const [completed, setCompleted] = useState(false);
  const [toast, setToast] = useState<OutcomeResult | null>(null);
  const startedAt = useRef(Date.now());

  useEffect(() => {
    startedAt.current = Date.now();
    if (!moduleId) return;
    api.startModule({ moduleId }).catch((error) => console.error("Could not start module", error));
  }, [moduleId]);

  useEffect(() => {
    if (progress.data?.status === "completed") setCompleted(true);
  }, [progress.data]);

  const complete = useAction(
    useCallback(async () => {
      const minutes = Math.max(1, Math.round((Date.now() - startedAt.current) / 60_000));
      await api.recordStudySession({ sessionId: newId(), topicId: module.data?.topicId ?? null, minutes, kind: "learning" });
      const result = await api.completeModule({ moduleId });
      setCompleted(true);
      if (!result.alreadyCompleted && typeof result.xp === "number") setToast(result as OutcomeResult);
      return result;
    }, [moduleId, module.data?.topicId])
  );

  const list = siblings.data ?? [];
  const index = list.findIndex((item) => item.id === moduleId);
  const next = index >= 0 ? list[index + 1] : undefined;

  return (
    <AsyncState loading={module.loading || progress.loading} error={module.error ?? progress.error} empty={!module.loading && !module.data} emptyTitle="Module not found">
      {module.data && (
        <div className="mx-auto max-w-3xl">
          <PageHeader
            title={module.data.title}
            subtitle={<>{module.data.description} · {module.data.estimatedMinutes} min · <Link to={`/learn/topic/${module.data.topicId}`} className="text-brand-700">Back to topic</Link></>}
            action={completed ? <Tag tone="success">Completed</Tag> : undefined}
          />
          <div className="space-y-4">
            {module.data.blocks.map((block, blockIndex) => <Block key={blockIndex} block={block} />)}
          </div>
          <div className="card mt-6">
            {completed ? (
              <p className="text-sm text-ink-700">You have completed this module. Rewards are given once; re-reading is always free.</p>
            ) : (
              <p className="text-sm text-ink-700">Finished reading? Mark it complete to earn XP and keep your streak.</p>
            )}
            <InlineError message={complete.error} />
            <div className="mt-3 flex flex-wrap gap-2">
              {!completed && <button type="button" className="btn-primary" disabled={complete.busy} onClick={() => complete.run()}>{complete.busy ? "Saving..." : "Mark as complete"}</button>}
              {next ? <Link to={`/learn/module/${next.id}`} className="btn-secondary">Next: {next.title}</Link> : <Link to={`/learn/topic/${module.data.topicId}`} className="btn-secondary">Back to topic</Link>}
              <Link to={`/problem-lab?topic=${module.data.topicId}`} className="btn-ghost">Practice this topic</Link>
            </div>
          </div>
          <RewardToast result={toast} onDone={() => setToast(null)} />
        </div>
      )}
    </AsyncState>
  );
}

function Block({ block }: { block: ModuleContentBlock }) {
  if (block.type === "keypoints") {
    return (
      <section className="card">
        <h2 className="font-semibold">{block.heading}</h2>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-ink-700">{block.body.split("\n").filter(Boolean).map((line) => <li key={line}>{line.replace(/^[-•]\s*/, "")}</li>)}</ul>
      </section>
    );
  }
  if (block.type === "formula") {
    return (
      <section className="card bg-ink-100">
        <h2 className="font-semibold">{block.heading}</h2>
        <pre className="mt-2 whitespace-pre-wrap font-mono text-sm text-ink-900">{block.body}</pre>
      </section>
    );
  }
  return (
    <section className={`card ${block.type === "example" ? "border-brand-100 bg-brand-50" : ""}`}>
      <h2 className="font-semibold">{block.heading}</h2>
      <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-ink-700">{block.body}</p>
    </section>
  );
}
