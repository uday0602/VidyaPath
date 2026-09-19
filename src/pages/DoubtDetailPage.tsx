import { useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { collection, deleteDoc, doc, orderBy, query, serverTimestamp, setDoc, updateDoc, where } from "firebase/firestore";
import { useAuth } from "../context/AuthContext";
import { SUBJECT_NAMES } from "../lib/content";
import { api } from "../lib/callables";
import { newId, timeAgo } from "../lib/format";
import { db } from "../lib/firebase";
import { useAction, useDoc, useLiveQuery, useQueryOnce } from "../hooks/useFirestore";
import { AsyncState, EmptyState, InlineError, Modal, Tag } from "../components/ui";
import type { BlockDoc, DoubtAnswerDoc, DoubtDoc, ReportReason, VoteDoc } from "../lib/types";

const REPORT_REASONS: { value: ReportReason; label: string }[] = [
  { value: "spam", label: "Spam" },
  { value: "abuse", label: "Abuse" },
  { value: "irrelevant", label: "Irrelevant" },
  { value: "inappropriate", label: "Inappropriate content" },
  { value: "harassment", label: "Harassment" },
  { value: "other", label: "Other" }
];

export default function DoubtDetailPage() {
  const { doubtId = "" } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const uid = user?.uid ?? "";
  const doubt = useDoc<DoubtDoc>(doubtId ? `doubts/${doubtId}` : null);
  const answers = useLiveQuery<DoubtAnswerDoc>(() => (doubtId ? query(collection(db, `doubts/${doubtId}/answers`), where("hidden", "==", false), orderBy("voteCount", "desc")) : null), [doubtId]);
  const votes = useQueryOnce<VoteDoc>(() => (uid && doubtId ? query(collection(db, "votes"), where("userId", "==", uid), where("doubtId", "==", doubtId)) : null), [uid, doubtId]);
  const blocks = useQueryOnce<BlockDoc>(() => (uid ? collection(db, `blocks/${uid}/users`) : null), [uid]);
  const [report, setReport] = useState<{ targetType: "doubt" | "answer" | "user"; targetId: string } | null>(null);
  const [answerBody, setAnswerBody] = useState("");
  const [votingId, setVotingId] = useState<string | null>(null);

  const votedIds = useMemo(() => new Set(votes.data.map((vote) => vote.answerId)), [votes.data]);
  const blockedIds = useMemo(() => new Set(blocks.data.map((block) => block.blockedUid)), [blocks.data]);
  const isAuthor = doubt.data?.authorId === uid;

  const postAnswer = useAction(async () => {
    const result = await api.postAnswer({ doubtId, body: answerBody.trim() });
    setAnswerBody("");
    doubt.reload();
    return result;
  });
  const vote = useAction(async (answerId: string) => {
    setVotingId(answerId);
    try {
      const result = await api.voteAnswer({ doubtId, answerId });
      votes.reload();
      return result;
    } finally {
      setVotingId(null);
    }
  });
  const resolve = useAction(async () => {
    await updateDoc(doc(db, "doubts", doubtId), { status: "resolved" });
    doubt.reload();
  });
  const block = useAction(async (blockedUid: string) => {
    await setDoc(doc(db, `blocks/${uid}/users/${blockedUid}`), { blockedUid, createdAt: serverTimestamp() });
    navigate("/doubts");
  });
  const unblock = useAction(async (blockedUid: string) => {
    await deleteDoc(doc(db, `blocks/${uid}/users/${blockedUid}`));
    blocks.reload();
  });

  return (
    <div className="mx-auto max-w-3xl">
      <Link to="/doubts" className="text-sm text-brand-600 hover:underline">← Back to Doubt Forum</Link>
      <AsyncState loading={doubt.loading} error={doubt.error} onRetry={doubt.reload}>
        {!doubt.data ? (
          <EmptyState title="Doubt not found" body="It may have been removed by a moderator." action={<Link className="btn-secondary" to="/doubts">Browse doubts</Link>} />
        ) : (
          <>
            <article className="card mt-3">
              <div className="flex flex-wrap items-center gap-2">
                <Tag tone="brand">{SUBJECT_NAMES[doubt.data.subjectId]}</Tag>
                <Tag tone={doubt.data.status === "resolved" ? "success" : doubt.data.status === "answered" ? "neutral" : "warn"}>{doubt.data.status}</Tag>
                <span className="text-xs text-ink-500">{doubt.data.authorName} · {timeAgo(doubt.data.createdAt)}</span>
              </div>
              <h1 className="mt-2 text-xl font-bold">{doubt.data.title}</h1>
              <p className="mt-2 whitespace-pre-wrap text-sm text-ink-700">{doubt.data.body}</p>
              <div className="mt-4 flex flex-wrap gap-2">
                {isAuthor && doubt.data.status !== "resolved" && (
                  <button type="button" className="btn-secondary" disabled={resolve.busy} onClick={() => void resolve.run()}>Mark resolved</button>
                )}
                {!isAuthor && (
                  <>
                    <button type="button" className="btn-ghost" onClick={() => setReport({ targetType: "doubt", targetId: doubt.data!.id })}>Report</button>
                    {blockedIds.has(doubt.data.authorId) ? (
                      <button type="button" className="btn-ghost" disabled={unblock.busy} onClick={() => void unblock.run(doubt.data!.authorId)}>Unblock author</button>
                    ) : (
                      <button type="button" className="btn-ghost" disabled={block.busy} onClick={() => void block.run(doubt.data!.authorId)}>Block author</button>
                    )}
                  </>
                )}
              </div>
              <InlineError message={resolve.error ?? block.error ?? unblock.error} />
            </article>

            <section className="mt-6">
              <h2 className="text-lg font-semibold">Answers</h2>
              <AsyncState loading={answers.loading} error={answers.error} empty={answers.data.filter((answer) => !blockedIds.has(answer.authorId)).length === 0} emptyTitle="No answers yet" emptyBody="Be the first to help.">
                <ul className="mt-3 space-y-3">
                  {answers.data.filter((answer) => !blockedIds.has(answer.authorId)).map((answer) => {
                    const mine = answer.authorId === uid;
                    const voted = votedIds.has(answer.id);
                    return (
                      <li key={answer.id} className="card">
                        <p className="whitespace-pre-wrap text-sm text-ink-700">{answer.body}</p>
                        <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-ink-500">
                          <span>{answer.authorName} · {timeAgo(answer.createdAt)}</span>
                          <button
                            type="button"
                            className={voted ? "btn-primary" : "btn-secondary"}
                            disabled={mine || voted || (vote.busy && votingId === answer.id)}
                            title={mine ? "You cannot upvote your own answer" : voted ? "Upvoted" : "Upvote"}
                            aria-pressed={voted}
                            onClick={() => void vote.run(answer.id)}
                          >
                            ▲ {answer.voteCount} {voted ? "Upvoted" : "Upvote"}
                          </button>
                          {!mine && <button type="button" className="btn-ghost" onClick={() => setReport({ targetType: "answer", targetId: answer.id })}>Report</button>}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </AsyncState>
              <InlineError message={vote.error} />
            </section>

            <form className="card mt-6" onSubmit={(event) => { event.preventDefault(); if (answerBody.trim().length >= 10) void postAnswer.run(); }}>
              <label className="label" htmlFor="answer-body">Your answer</label>
              <textarea id="answer-body" className="input min-h-28" maxLength={2000} value={answerBody} onChange={(event) => setAnswerBody(event.target.value)} placeholder="Explain the idea step by step. Keep it kind and on topic." />
              <div className="mt-3 flex items-center gap-3">
                <button type="submit" className="btn-primary" disabled={answerBody.trim().length < 10 || postAnswer.busy}>{postAnswer.busy ? "Posting..." : "Post answer"}</button>
                <span className="text-xs text-ink-500">Short cooldown between answers. Duplicates are rejected.</span>
              </div>
              <InlineError message={postAnswer.error} />
            </form>
          </>
        )}
      </AsyncState>
      <ReportModal uid={uid} doubtId={doubtId} target={report} onClose={() => setReport(null)} />
    </div>
  );
}

function ReportModal({ uid, doubtId, target, onClose }: { uid: string; doubtId: string; target: { targetType: "doubt" | "answer" | "user"; targetId: string } | null; onClose: () => void }) {
  const [reason, setReason] = useState<ReportReason>("spam");
  const [details, setDetails] = useState("");
  const [sent, setSent] = useState(false);
  const submit = useAction(async () => {
    if (!target) return null;
    await setDoc(doc(db, "reports", newId()), { reporterId: uid, targetType: target.targetType, targetId: target.targetId, doubtId, reason, details: details.trim(), status: "open", createdAt: serverTimestamp() });
    setSent(true);
    return true;
  });
  const close = () => { setSent(false); setDetails(""); onClose(); };
  return (
    <Modal open={Boolean(target)} title="Report content" onClose={close}>
      {sent ? (
        <>
          <p className="text-sm">Thanks. A moderator will review this report.</p>
          <button type="button" className="btn-primary mt-4" onClick={close}>Close</button>
        </>
      ) : (
        <>
          <label className="label" htmlFor="report-reason">Reason</label>
          <select id="report-reason" className="input" value={reason} onChange={(event) => setReason(event.target.value as ReportReason)}>
            {REPORT_REASONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
          <label className="label mt-3" htmlFor="report-details">Details (optional)</label>
          <textarea id="report-details" className="input" maxLength={1000} value={details} onChange={(event) => setDetails(event.target.value)} />
          <div className="mt-4 flex justify-end gap-2">
            <button type="button" className="btn-secondary" onClick={close}>Cancel</button>
            <button type="button" className="btn-danger" disabled={submit.busy} onClick={() => void submit.run()}>{submit.busy ? "Sending..." : "Send report"}</button>
          </div>
          <InlineError message={submit.error} />
        </>
      )}
    </Modal>
  );
}
