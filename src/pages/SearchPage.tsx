import { useMemo } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { content, SUBJECT_NAMES, useContent } from "../lib/content";
import { AsyncState, EmptyState, PageHeader, Tag } from "../components/ui";

interface SearchEntry {
  type: "Chapter" | "Topic" | "Problem" | "Formula" | "Career" | "AI Tutor";
  title: string;
  detail: string;
  link: string;
  haystack: string;
}

const AI_MODES = ["Explain Concept", "Solve With Me", "Give Hint", "Generate Questions", "Check My Answer", "Find My Mistake", "Revision", "Exam Mode"];

export default function SearchPage() {
  const [params] = useSearchParams();
  const queryText = (params.get("q") ?? "").trim().toLowerCase();
  const chapters = useContent(() => content.allChapters(), []);
  const topics = useContent(() => content.allTopics(), []);
  const problems = useContent(() => content.allProblems(), []);
  const careers = useContent(() => content.careers(), []);

  const index = useMemo<SearchEntry[]>(() => {
    const entries: SearchEntry[] = [];
    for (const chapter of chapters.data ?? []) {
      entries.push({ type: "Chapter", title: chapter.name, detail: `Class ${chapter.classLevel} · ${SUBJECT_NAMES[chapter.subjectId]}${chapter.sampleOnly ? " · Sample" : ""}`, link: `/ncert/${chapter.classLevel}/${chapter.subjectId}`, haystack: chapter.name });
    }
    for (const topic of topics.data ?? []) {
      entries.push({ type: "Topic", title: topic.name, detail: `Class ${topic.classLevel} · ${SUBJECT_NAMES[topic.subjectId]}`, link: `/learn/topic/${topic.id}`, haystack: `${topic.name} ${topic.keyPoints.join(" ")}` });
      for (const formula of topic.formulae) {
        entries.push({ type: "Formula", title: formula, detail: topic.name, link: `/learn/topic/${topic.id}`, haystack: formula });
      }
    }
    for (const problem of problems.data ?? []) {
      entries.push({ type: "Problem", title: problem.title, detail: `Level ${problem.level} · ${problem.examTypes.join(", ")} · ${problem.concept}`, link: `/problem-lab/${problem.id}`, haystack: `${problem.title} ${problem.statement} ${problem.concept}` });
    }
    for (const career of careers.data ?? []) {
      entries.push({ type: "Career", title: career.name, detail: career.summary, link: "/careers", haystack: `${career.name} ${career.summary} ${career.subjects.join(" ")}` });
    }
    for (const mode of AI_MODES) {
      entries.push({ type: "AI Tutor", title: mode, detail: "Open the AI Tutor in this mode", link: "/ai-tutor", haystack: `${mode} ai tutor` });
    }
    return entries;
  }, [chapters.data, topics.data, problems.data, careers.data]);

  const matches = queryText ? index.filter((entry) => entry.haystack.toLowerCase().includes(queryText)) : [];
  const grouped = matches.reduce<Record<string, SearchEntry[]>>((accumulator, entry) => {
    (accumulator[entry.type] ??= []).push(entry);
    return accumulator;
  }, {});

  return (
    <div>
      <PageHeader title="Search" subtitle={queryText ? `Results for "${params.get("q")}"` : "Search topics, chapters, problems, formulae, careers and AI Tutor modes from the bar above."} />
      <AsyncState loading={chapters.loading || topics.loading || problems.loading || careers.loading} error={chapters.error ?? topics.error ?? problems.error ?? careers.error} loadingLabel="Building search index...">
        {!queryText ? (
          <EmptyState title="Type something to search" body="Try 'quadratic', 'v = u + at' or 'engineering'." />
        ) : matches.length === 0 ? (
          <EmptyState title="No matches" body="Try a shorter word or a different spelling." />
        ) : (
          <div className="space-y-4">
            {Object.entries(grouped).map(([type, entries]) => (
              <section key={type} className="card" aria-label={type}>
                <h2 className="font-semibold">{type} <Tag>{entries.length}</Tag></h2>
                <ul className="mt-2 divide-y divide-ink-100">
                  {entries.slice(0, 20).map((entry, entryIndex) => (
                    <li key={`${entry.link}-${entryIndex}`} className="py-2 text-sm">
                      <Link to={entry.link} className="font-medium text-brand-700">{entry.title}</Link>
                      <p className="text-ink-500">{entry.detail}</p>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        )}
      </AsyncState>
    </div>
  );
}
