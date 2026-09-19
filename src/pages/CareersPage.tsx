import { useMemo, useState } from "react";
import { content, useContent } from "../lib/content";
import { AsyncState, PageHeader, Tag } from "../components/ui";

export default function CareersPage() {
  const careers = useContent(() => content.careers(), []);
  const [subjectFilter, setSubjectFilter] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);

  const subjects = useMemo(() => Array.from(new Set((careers.data ?? []).flatMap((career) => career.subjects))).sort(), [careers.data]);
  const visible = (careers.data ?? []).filter((career) => !subjectFilter || career.subjects.includes(subjectFilter));

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader title="Career Explorer" subtitle="Informational overview of paths after Class 12. Static content curated by the team, not personalised advice." />
      <AsyncState loading={careers.loading} error={careers.error} empty={(careers.data ?? []).length === 0} emptyTitle="No career paths yet" emptyBody="Career content is seeded by the team.">
        <div className="mb-4 flex flex-wrap gap-2">
          <button type="button" className={subjectFilter ? "btn-secondary" : "btn-primary"} onClick={() => setSubjectFilter(null)} aria-pressed={!subjectFilter}>All</button>
          {subjects.map((subject) => (
            <button key={subject} type="button" className={subjectFilter === subject ? "btn-primary" : "btn-secondary"} onClick={() => setSubjectFilter(subject)} aria-pressed={subjectFilter === subject}>{subject}</button>
          ))}
        </div>
        <ul className="space-y-3">
          {visible.map((career) => {
            const open = openId === career.id;
            return (
              <li key={career.id} className="card">
                <button type="button" className="flex w-full items-start justify-between gap-3 text-left" aria-expanded={open} onClick={() => setOpenId(open ? null : career.id)}>
                  <div>
                    <h2 className="font-semibold">{career.name}</h2>
                    <p className="mt-1 text-sm text-ink-700">{career.summary}</p>
                    <div className="mt-2 flex flex-wrap gap-1">{career.subjects.map((subject) => <Tag key={subject} tone="brand">{subject}</Tag>)}</div>
                  </div>
                  <span aria-hidden="true">{open ? "▴" : "▾"}</span>
                </button>
                {open && (
                  <div className="mt-4 grid gap-4 text-sm sm:grid-cols-2">
                    <Section title="Skills" items={career.skills} />
                    <Section title="Common entrance routes" items={career.entranceRoutes} />
                    <Section title="Example careers" items={career.exampleCareers} />
                    <Section title="Suggested preparation" items={career.preparation} />
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      </AsyncState>
    </div>
  );
}

function Section({ title, items }: { title: string; items: string[] }) {
  return (
    <div>
      <h3 className="font-semibold">{title}</h3>
      <ul className="mt-1 list-disc pl-5 text-ink-700">{items.map((item) => <li key={item}>{item}</li>)}</ul>
    </div>
  );
}
