import { Link, useParams } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { content, SUBJECT_NAMES, useContent } from "../lib/content";
import { AsyncState, EmptyState, PageHeader, SampleTag, Tag } from "../components/ui";
import type { ChapterDoc, ClassLevel, SubjectId, TopicDoc } from "../lib/types";

const CLASSES: ClassLevel[] = [9, 10, 11, 12];

export default function NcertPage() {
  const params = useParams<{ classLevel?: string; subjectId?: string }>();
  const { profile } = useAuth();
  const classLevel = (params.classLevel ? Number(params.classLevel) : null) as ClassLevel | null;
  const subjectId = (params.subjectId ?? null) as SubjectId | null;

  return (
    <div>
      <PageHeader title="NCERT Learning Hub" subtitle="Class → Subject → Chapter → Topic. Full topics include concept, examples, practice, quiz and revision." />
      <nav aria-label="Breadcrumb" className="mb-4 text-sm text-ink-500">
        <Link to="/ncert" className="text-brand-700">Classes</Link>
        {classLevel && <> / <Link to={`/ncert/${classLevel}`} className="text-brand-700">Class {classLevel}</Link></>}
        {classLevel && subjectId && <> / <span>{SUBJECT_NAMES[subjectId] ?? subjectId}</span></>}
      </nav>
      {!classLevel && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {CLASSES.map((level) => (
            <Link key={level} to={`/ncert/${level}`} className={`card hover:border-brand-500 ${profile?.classLevel === level ? "border-brand-500" : ""}`}>
              <p className="text-2xl font-bold">Class {level}</p>
              {profile?.classLevel === level && <Tag tone="brand">Your class</Tag>}
            </Link>
          ))}
        </div>
      )}
      {classLevel && !subjectId && <SubjectList classLevel={classLevel} />}
      {classLevel && subjectId && <ChapterList classLevel={classLevel} subjectId={subjectId} />}
    </div>
  );
}

function SubjectList({ classLevel }: { classLevel: ClassLevel }) {
  const subjects = useContent(() => content.subjects(), []);
  const applicable = (subjects.data ?? []).filter((subject) => subject.classLevels.includes(classLevel));
  return (
    <AsyncState loading={subjects.loading} error={subjects.error} empty={!subjects.loading && applicable.length === 0} emptyTitle="No subjects for this class yet">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {applicable.map((subject) => (
          <Link key={subject.id} to={`/ncert/${classLevel}/${subject.id}`} className="card hover:border-brand-500">
            <p className="text-lg font-semibold">{subject.name}</p>
            <p className="text-sm text-ink-500">Class {classLevel}</p>
          </Link>
        ))}
      </div>
    </AsyncState>
  );
}

function ChapterList({ classLevel, subjectId }: { classLevel: ClassLevel; subjectId: SubjectId }) {
  const chapters = useContent(() => content.chapters(classLevel, subjectId), [classLevel, subjectId]);
  return (
    <AsyncState loading={chapters.loading} error={chapters.error} empty={!chapters.loading && (chapters.data ?? []).length === 0} emptyTitle="No chapters yet" emptyBody="Content for this subject is not seeded.">
      <ol className="space-y-3">
        {(chapters.data ?? []).map((chapter, index) => <ChapterCard key={chapter.id} chapter={chapter} index={index + 1} />)}
      </ol>
    </AsyncState>
  );
}

function ChapterCard({ chapter, index }: { chapter: ChapterDoc; index: number }) {
  return (
    <li className="card">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="font-semibold">{index}. {chapter.name}</p>
        <div className="flex gap-1">
          {chapter.examTags.map((tag) => <Tag key={tag} tone="neutral">{tag.toUpperCase()}</Tag>)}
          {chapter.sampleOnly && <SampleTag />}
        </div>
      </div>
      <TopicLinks chapterId={chapter.id} isSampleOnly={chapter.sampleOnly} />
    </li>
  );
}

function TopicLinks({ chapterId, isSampleOnly }: { chapterId: string; isSampleOnly?: boolean }) {
  const topics = useContent(() => content.topics(chapterId), [chapterId]);
  if (topics.loading) return <p className="mt-1 text-sm text-ink-500">Loading topics...</p>;
  if (topics.error) return <p className="mt-1 text-sm text-danger-500">{topics.error}</p>;
  const list = topics.data ?? [];
  if (list.length === 0) {
    return isSampleOnly ? (
      <p className="mt-1 text-sm text-ink-500">Chapter syllabus outline. Detailed interactive module coming soon; explore the unlocked full chapters above.</p>
    ) : (
      <div className="mt-2"><EmptyState title="No topics in this chapter yet" /></div>
    );
  }
  return (
    <ul className="mt-2 grid gap-2 sm:grid-cols-2">
      {list.map((topic: TopicDoc) => (
        <li key={topic.id}>
          <Link to={`/learn/topic/${topic.id}`} className="flex items-center justify-between rounded-lg bg-ink-100 px-3 py-2 text-sm hover:bg-brand-50">
            <span className="font-medium text-ink-900">{topic.name}</span>
            <span className="text-xs font-semibold text-brand-700">Open Module →</span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
