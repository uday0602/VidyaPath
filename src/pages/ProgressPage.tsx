import { useMemo } from "react";
import { collection, getDocs, limit, orderBy, query, where } from "firebase/firestore";
import { Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { db } from "../lib/firebase";
import { content, SUBJECT_NAMES, useContent } from "../lib/content";
import { useAuth } from "../context/AuthContext";
import { usePreferences } from "../context/PreferencesContext";
import { useQueryOnce } from "../hooks/useFirestore";
import { AsyncState, EmptyState, PageHeader, StatTile, Tag } from "../components/ui";
import { LEVEL_NAMES, MISTAKE_LABELS, type BadgeDoc, type DailyActivityDoc, type ModuleProgressDoc, type MistakeType, type TopicProgressDoc } from "../lib/types";

interface AwardedBadge {
  badgeId: string;
}

export default function ProgressPage() {
  const { user, profile } = useAuth();
  const { lowData } = usePreferences();
  const uid = user?.uid ?? "";
  const topicProgress = useQueryOnce<TopicProgressDoc>(() => (uid ? query(collection(db, `studentProgress/${uid}/topics`)) : null), [uid]);
  const moduleProgress = useQueryOnce<ModuleProgressDoc>(() => (uid ? query(collection(db, `studentProgress/${uid}/modules`)) : null), [uid]);
  const activity = useQueryOnce<DailyActivityDoc>(() => (uid ? query(collection(db, "dailyActivity"), where("uid", "==", uid), orderBy("date", "desc"), limit(14)) : null), [uid]);
  const awarded = useQueryOnce<AwardedBadge>(() => (uid ? query(collection(db, `userBadges/${uid}/badges`)) : null), [uid]);
  const topics = useContent(() => content.allTopics(), []);
  const badges = useContent(async () => (await getDocs(collection(db, "badges"))).docs.map((item) => ({ id: item.id, ...item.data() }) as BadgeDoc), []);

  const topicById = useMemo(() => new Map((topics.data ?? []).map((topic) => [topic.id, topic])), [topics.data]);

  const subjectAccuracy = useMemo(() => {
    const totals = new Map<string, { attempts: number; correct: number }>();
    topicProgress.data.forEach((entry) => {
      const current = totals.get(entry.subjectId) ?? { attempts: 0, correct: 0 };
      totals.set(entry.subjectId, { attempts: current.attempts + entry.attempts, correct: current.correct + entry.correct });
    });
    return [...totals.entries()]
      .filter(([, value]) => value.attempts > 0)
      .map(([subjectId, value]) => ({ subject: SUBJECT_NAMES[subjectId as keyof typeof SUBJECT_NAMES] ?? subjectId, accuracy: Math.round((value.correct / value.attempts) * 100) }));
  }, [topicProgress.data]);

  const mistakesByType = useMemo(() => {
    const counts: Partial<Record<MistakeType, number>> = {};
    topicProgress.data.forEach((entry) => {
      Object.entries(entry.mistakeCounts ?? {}).forEach(([type, count]) => {
        counts[type as MistakeType] = (counts[type as MistakeType] ?? 0) + (count ?? 0);
      });
    });
    return (Object.entries(counts) as [MistakeType, number][]).filter(([, count]) => count > 0).map(([type, count]) => ({ type: MISTAKE_LABELS[type], count }));
  }, [topicProgress.data]);

  const minutesPerDay = useMemo(() => [...activity.data].reverse().map((entry) => ({ date: entry.date.slice(5), minutes: entry.minutes })), [activity.data]);
  const totalMinutes = activity.data.reduce((sum, entry) => sum + entry.minutes, 0);
  const totalAttempts = topicProgress.data.reduce((sum, entry) => sum + entry.attempts, 0);
  const totalCorrect = topicProgress.data.reduce((sum, entry) => sum + entry.correct, 0);
  const overallAccuracy = totalAttempts === 0 ? 0 : Math.round((totalCorrect / totalAttempts) * 100);
  const revisions = activity.data.reduce((sum, entry) => sum + entry.revisions, 0);
  const completedModules = moduleProgress.data.filter((entry) => entry.status === "completed").length;
  const badgeById = useMemo(() => new Map((badges.data ?? []).map((badge) => [badge.id, badge])), [badges.data]);

  const loading = topicProgress.loading || moduleProgress.loading || activity.loading || awarded.loading || topics.loading || badges.loading;
  const error = topicProgress.error || moduleProgress.error || activity.error || awarded.error || topics.error || badges.error;

  return (
    <div>
      <PageHeader title="Progress" subtitle="Your learning in numbers: accuracy by subject, where mistakes come from, and how consistently you study." />
      <AsyncState loading={loading} error={error} loadingLabel="Crunching your progress...">
        <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <StatTile label="Study minutes (14 days)" value={totalMinutes} />
          <StatTile label="Modules completed" value={completedModules} />
          <StatTile label="Questions solved" value={profile?.questionsSolved ?? totalCorrect} />
          <StatTile label="Accuracy" value={`${overallAccuracy}%`} />
          <StatTile label="Revision sessions" value={revisions} />
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <ChartCard title="Accuracy by subject" empty={subjectAccuracy.length === 0} lowData={lowData} table={<SimpleTable rows={subjectAccuracy.map((row) => [row.subject, `${row.accuracy}%`])} headers={["Subject", "Accuracy"]} />}>
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={subjectAccuracy}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="subject" />
                <YAxis domain={[0, 100]} unit="%" />
                <Tooltip />
                <Legend />
                <Bar dataKey="accuracy" name="Accuracy %" fill="#2f5bea" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>

          <ChartCard title="Mistakes by type" empty={mistakesByType.length === 0} lowData={lowData} table={<SimpleTable rows={mistakesByType.map((row) => [row.type, String(row.count)])} headers={["Mistake type", "Count"]} />}>
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={mistakesByType} layout="vertical" margin={{ left: 40 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis type="number" allowDecimals={false} />
                <YAxis type="category" dataKey="type" width={140} />
                <Tooltip />
                <Legend />
                <Bar dataKey="count" name="Mistakes" fill="#d97706" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>

          <ChartCard title="Study minutes per day (last 14 days)" empty={minutesPerDay.length === 0} lowData={lowData} table={<SimpleTable rows={minutesPerDay.map((row) => [row.date, String(row.minutes)])} headers={["Date", "Minutes"]} />}>
            <ResponsiveContainer width="100%" height={240}>
              <LineChart data={minutesPerDay}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" />
                <YAxis allowDecimals={false} unit="m" />
                <Tooltip />
                <Legend />
                <Line type="monotone" dataKey="minutes" name="Minutes" stroke="#16a34a" strokeWidth={2} dot={{ r: 3 }} />
              </LineChart>
            </ResponsiveContainer>
          </ChartCard>

          <div className="card">
            <p className="mb-3 font-semibold">Badges earned</p>
            {awarded.data.length === 0 ? (
              <p className="text-sm text-ink-500">No badges yet. Complete a module to earn your first one.</p>
            ) : (
              <ul className="flex flex-wrap gap-2">
                {awarded.data.map((entry) => {
                  const badge = badgeById.get(entry.badgeId);
                  return (
                    <li key={entry.badgeId} className="rounded-lg border border-ink-200 px-3 py-2 text-sm" title={badge?.description}>
                      <span aria-hidden="true">{badge?.icon ?? "🏅"} </span>{badge?.name ?? entry.badgeId}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>

        <div className="card mt-4 overflow-x-auto">
          <p className="mb-3 font-semibold">Topic mastery</p>
          {topicProgress.data.length === 0 ? (
            <EmptyState title="No topic progress yet" body="Solve problems or take a quiz and this table fills in." />
          ) : (
            <table className="w-full text-sm">
              <thead className="text-left text-xs uppercase text-ink-500">
                <tr><th className="py-2">Topic</th><th>Level unlocked</th><th>Accuracy</th><th>Attempts</th><th>Mastery</th></tr>
              </thead>
              <tbody>
                {topicProgress.data.map((entry) => (
                  <tr key={entry.topicId} className="border-t border-ink-200">
                    <td className="py-2">{topicById.get(entry.topicId)?.name ?? entry.topicId}</td>
                    <td><Tag tone="brand">Level {entry.levelUnlocked}: {LEVEL_NAMES[entry.levelUnlocked]}</Tag></td>
                    <td>{entry.accuracy}%</td>
                    <td>{entry.attempts}</td>
                    <td>{Math.round(entry.mastery)}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </AsyncState>
    </div>
  );
}

function ChartCard({ title, empty, lowData, table, children }: { title: string; empty: boolean; lowData: boolean; table: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="card">
      <p className="mb-3 font-semibold">{title}</p>
      {empty ? <EmptyState title="No data yet" body="Keep learning and this chart will appear." /> : lowData ? table : children}
    </div>
  );
}

function SimpleTable({ headers, rows }: { headers: string[]; rows: string[][] }) {
  return (
    <table className="w-full text-sm">
      <thead className="text-left text-xs uppercase text-ink-500">
        <tr>{headers.map((header) => <th key={header} className="py-1">{header}</th>)}</tr>
      </thead>
      <tbody>
        {rows.map((row, index) => (
          <tr key={index} className="border-t border-ink-200">{row.map((cell, cellIndex) => <td key={cellIndex} className="py-1">{cell}</td>)}</tr>
        ))}
      </tbody>
    </table>
  );
}
