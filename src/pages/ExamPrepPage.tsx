import { useMemo } from "react";
import { Link, useParams } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { content, SUBJECT_NAMES, useContent } from "../lib/content";
import { AsyncState, EmptyState, PageHeader, SampleTag, Tag } from "../components/ui";
import { GOAL_LABELS, type ExamType, type ProblemDoc } from "../lib/types";

const TRACKS: Record<string, { exam: ExamType; title: string; blurb: string; goals: string[] }> = {
  board: { exam: "board", title: "Board Prep", blurb: "NCERT-aligned questions in the style of your board exam. Levels 1 to 3 cover what the paper expects.", goals: ["board", "board_jee", "board_neet"] },
  jee: { exam: "jee", title: "JEE Foundation", blurb: "Reasoning-heavy Physics, Chemistry and Mathematics problems that build toward JEE. Levels 3 to 5 matter most here.", goals: ["jee", "board_jee"] },
  neet: { exam: "neet", title: "NEET Foundation", blurb: "Concept-first Physics, Chemistry and Biology practice with time-bound questions in NEET style.", goals: ["neet", "board_neet"] }
};

export default function ExamPrepPage() {
  const { track = "board" } = useParams<{ track: string }>();
  const config = TRACKS[track] ?? TRACKS.board;
  const { profile } = useAuth();
  const classLevel = profile?.classLevel ?? 10;
  const problems = useContent(() => content.allProblems(), []);
  const topics = useContent(() => content.allTopics(), []);
  const chapters = useContent(() => content.allChapters(), []);
  const topicNames = useMemo(() => new Map((topics.data ?? []).map((topic) => [topic.id, topic.name])), [topics.data]);

  const relevant = (problems.data ?? []).filter((problem) => problem.classLevel === classLevel && (problem.examTypes.includes(config.exam) || problem.examTypes.includes("mixed")));
  const grouped = useMemo(() => {
    const bySubject = new Map<string, Map<string, ProblemDoc[]>>();
    for (const problem of relevant) {
      const subject = bySubject.get(problem.subjectId) ?? new Map<string, ProblemDoc[]>();
      subject.set(problem.topicId, [...(subject.get(problem.topicId) ?? []), problem]);
      bySubject.set(problem.subjectId, subject);
    }
    return bySubject;
  }, [relevant]);
  const taggedChapters = (chapters.data ?? []).filter((chapter) => chapter.classLevel === classLevel && chapter.examTags.includes(config.exam));
  const offTrack = profile && !config.goals.includes(profile.goal);

  return (
    <div>
      <PageHeader title={config.title} subtitle={config.blurb} />
      {offTrack && profile && (
        <p className="mb-4 rounded-lg bg-warn-500/10 p-3 text-sm text-warn-500">Your goal is {GOAL_LABELS[profile.goal]}. You can still practise this track; change your goal in settings if it should shape your plan.</p>
      )}
      <AsyncState loading={problems.loading || topics.loading || chapters.loading} error={problems.error ?? topics.error ?? chapters.error}>
        <div className="grid gap-4 lg:grid-cols-3">
          <div className="space-y-4 lg:col-span-2">
            {grouped.size === 0 ? (
              <EmptyState title={`No ${config.title} problems for Class ${classLevel} yet`} body="Problems tagged for this exam are seeded for the fully built chapters only." action={<Link to="/problem-lab" className="btn-primary">Open Problem Lab</Link>} />
            ) : (
              Array.from(grouped.entries()).map(([subjectId, byTopic]) => (
                <section key={subjectId} className="card" aria-label={SUBJECT_NAMES[subjectId as keyof typeof SUBJECT_NAMES]}>
                  <h2 className="font-semibold">{SUBJECT_NAMES[subjectId as keyof typeof SUBJECT_NAMES] ?? subjectId}</h2>
                  <ul className="mt-2 space-y-3">
                    {Array.from(byTopic.entries()).map(([topicId, list]) => {
                      const levelCounts = [1, 2, 3, 4, 5].map((level) => list.filter((problem) => problem.level === level).length);
                      return (
                        <li key={topicId} className="rounded-lg bg-ink-100 p-3">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <Link to={`/learn/topic/${topicId}`} className="font-medium text-brand-700">{topicNames.get(topicId) ?? topicId}</Link>
                            <div className="flex gap-1">{levelCounts.map((count, index) => count > 0 && <Tag key={index}>L{index + 1}: {count}</Tag>)}</div>
                          </div>
                          <ul className="mt-2 grid gap-1 text-sm sm:grid-cols-2">
                            {list.slice(0, 6).map((problem) => (
                              <li key={problem.id}><Link to={`/problem-lab/${problem.id}`} className="text-ink-700 hover:text-brand-700">L{problem.level} · {problem.title}</Link></li>
                            ))}
                          </ul>
                          {list.length > 6 && <Link to={`/problem-lab?topic=${topicId}`} className="mt-1 inline-block text-xs text-brand-700">All {list.length} problems</Link>}
                        </li>
                      );
                    })}
                  </ul>
                </section>
              ))
            )}
          </div>
          <section className="card" aria-labelledby="chapters-heading">
            <h2 id="chapters-heading" className="font-semibold">Chapters on this track (Class {classLevel})</h2>
            {taggedChapters.length === 0 ? (
              <p className="mt-1 text-sm text-ink-500">No chapters tagged yet.</p>
            ) : (
              <ul className="mt-2 space-y-1 text-sm">
                {taggedChapters.map((chapter) => (
                  <li key={chapter.id} className="flex items-center justify-between gap-2">
                    <Link to={`/ncert/${chapter.classLevel}/${chapter.subjectId}`} className="text-brand-700">{chapter.name}</Link>
                    {chapter.sampleOnly && <SampleTag />}
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </AsyncState>
    </div>
  );
}
