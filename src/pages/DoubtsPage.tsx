import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { collection, limit, orderBy, query, where, type QueryConstraint } from "firebase/firestore";
import { useAuth } from "../context/AuthContext";
import { content, SUBJECT_NAMES, useContent } from "../lib/content";
import { api } from "../lib/callables";
import { timeAgo } from "../lib/format";
import { db } from "../lib/firebase";
import { useAction, useQueryOnce } from "../hooks/useFirestore";
import { AsyncState, InlineError, PageHeader, Tag } from "../components/ui";
import type { BlockDoc, DoubtDoc, SubjectId } from "../lib/types";

type Sort = "newest" | "unanswered" | "popular";

export default function DoubtsPage() {
  const { user, profile } = useAuth();
  const uid = user?.uid ?? "";
  const [subject, setSubject] = useState<SubjectId | "all">("all");
  const [sort, setSort] = useState<Sort>("newest");
  const [showForm, setShowForm] = useState(false);

  const blocks = useQueryOnce<BlockDoc>(() => (uid ? collection(db, `blocks/${uid}/users`) : null), [uid]);
  const doubts = useQueryOnce<DoubtDoc>(() => {
    const constraints: QueryConstraint[] = [where("hidden", "==", false)];
    if (sort === "unanswered") constraints.push(where("status", "==", "open"));
    else if (subject !== "all") constraints.push(where("subjectId", "==", subject));
    constraints.push(orderBy("createdAt", "desc"), limit(30));
    return query(collection(db, "doubts"), ...constraints);
  }, [subject, sort]);

  const visible = useMemo(() => {
    const blocked = new Set(blocks.data.map((block) => block.blockedUid));
    let rows = doubts.data.filter((doubt) => !blocked.has(doubt.authorId));
    if (sort === "unanswered" && subject !== "all") rows = rows.filter((doubt) => doubt.subjectId === subject);
    if (sort === "popular") rows = [...rows].sort((left, right) => right.voteCount - left.voteCount);
    return rows;
  }, [doubts.data, blocks.data, sort, subject]);

  const subjects = useContent(() => content.subjects(), []);
  const subjectChoices = (subjects.data ?? []).filter((item) => !profile || item.classLevels.includes(profile.classLevel));

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader title="Doubt Forum" subtitle="Ask peers, answer doubts, upvote what helps. Your real name and email are never shown; only your anonymous username." action={<button type="button" className="btn-primary" onClick={() => setShowForm((value) => !value)}>{showForm ? "Close" : "Post a doubt"}</button>} />
      {showForm && <PostDoubtForm subjectChoices={subjectChoices.map((item) => item.id)} classLevel={profile?.classLevel ?? 10} onPosted={(doubtId) => { setShowForm(false); doubts.reload(); void doubtId; }} />}
      <div className="mb-4 flex flex-wrap gap-2">
        <label className="sr-only" htmlFor="doubt-subject">Subject filter</label>
        <select id="doubt-subject" className="input w-48" value={subject} onChange={(event) => setSubject(event.target.value as SubjectId | "all")}>
          <option value="all">All subjects</option>
          {subjectChoices.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
        </select>
        {(["newest", "unanswered", "popular"] as Sort[]).map((option) => (
          <button key={option} type="button" className={sort === option ? "btn-primary" : "btn-secondary"} onClick={() => setSort(option)} aria-pressed={sort === option}>
            {option[0].toUpperCase() + option.slice(1)}
          </button>
        ))}
      </div>
      <AsyncState loading={doubts.loading || blocks.loading} error={doubts.error ?? blocks.error} onRetry={doubts.reload} empty={visible.length === 0} emptyTitle="No doubts yet. Be the first to ask." emptyBody="Use the Post a doubt button above.">
        <ul className="space-y-3">
          {visible.map((doubt) => (
            <li key={doubt.id} className="card">
              <Link to={`/doubts/${doubt.id}`} className="font-semibold text-brand-700 hover:underline">{doubt.title}</Link>
              <p className="mt-1 line-clamp-2 text-sm text-ink-700">{doubt.body}</p>
              <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-ink-500">
                <Tag tone="brand">{SUBJECT_NAMES[doubt.subjectId]}</Tag>
                <Tag tone={doubt.status === "resolved" ? "success" : doubt.status === "answered" ? "neutral" : "warn"}>{doubt.status}</Tag>
                <span>{doubt.authorName}</span>
                <span>· {doubt.answerCount} answers</span>
                <span>· {doubt.voteCount} upvotes</span>
                <span>· {timeAgo(doubt.createdAt)}</span>
              </div>
            </li>
          ))}
        </ul>
      </AsyncState>
    </div>
  );
}

function PostDoubtForm({ subjectChoices, classLevel, onPosted }: { subjectChoices: SubjectId[]; classLevel: 9 | 10 | 11 | 12; onPosted: (doubtId: string) => void }) {
  const navigate = useNavigate();
  const [subjectId, setSubjectId] = useState<SubjectId>(subjectChoices[0] ?? "mathematics");
  const [chapterId, setChapterId] = useState("");
  const [topicId, setTopicId] = useState("");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const chapters = useContent(() => content.chapters(classLevel, subjectId), [classLevel, subjectId]);
  const topics = useContent(() => (chapterId ? content.topics(chapterId) : Promise.resolve([])), [chapterId]);
  const post = useAction(async () => {
    const result = await api.postDoubt({ subjectId, chapterId: chapterId || null, topicId: topicId || null, title: title.trim(), body: body.trim() });
    onPosted(result.doubtId);
    navigate(`/doubts/${result.doubtId}`);
    return result;
  });
  const valid = title.trim().length >= 5 && body.trim().length >= 10;

  return (
    <form className="card mb-4" onSubmit={(event) => { event.preventDefault(); if (valid) void post.run(); }}>
      <div className="grid gap-3 sm:grid-cols-3">
        <div>
          <label className="label" htmlFor="post-subject">Subject</label>
          <select id="post-subject" className="input" value={subjectId} onChange={(event) => { setSubjectId(event.target.value as SubjectId); setChapterId(""); setTopicId(""); }}>
            {subjectChoices.map((item) => <option key={item} value={item}>{SUBJECT_NAMES[item]}</option>)}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="post-chapter">Chapter (optional)</label>
          <select id="post-chapter" className="input" value={chapterId} onChange={(event) => { setChapterId(event.target.value); setTopicId(""); }}>
            <option value="">Any</option>
            {(chapters.data ?? []).map((chapter) => <option key={chapter.id} value={chapter.id}>{chapter.name}</option>)}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="post-topic">Topic (optional)</label>
          <select id="post-topic" className="input" value={topicId} onChange={(event) => setTopicId(event.target.value)} disabled={!chapterId}>
            <option value="">Any</option>
            {(topics.data ?? []).map((topic) => <option key={topic.id} value={topic.id}>{topic.name}</option>)}
          </select>
        </div>
      </div>
      <label className="label mt-3" htmlFor="post-title">Title</label>
      <input id="post-title" className="input" maxLength={140} value={title} onChange={(event) => setTitle(event.target.value)} placeholder="What exactly is confusing?" />
      <label className="label mt-3" htmlFor="post-body">Details</label>
      <textarea id="post-body" className="input min-h-28" maxLength={2000} value={body} onChange={(event) => setBody(event.target.value)} placeholder="Describe the question and what you tried." />
      <div className="mt-3 flex items-center gap-3">
        <button type="submit" className="btn-primary" disabled={!valid || post.busy}>{post.busy ? "Posting..." : "Post doubt"}</button>
        <span className="text-xs text-ink-500">One doubt every two minutes. Duplicates are rejected.</span>
      </div>
      <InlineError message={post.error} />
    </form>
  );
}
