import { useMemo, useState } from "react";
import { collection, doc, limit, orderBy, query, updateDoc, where } from "firebase/firestore";
import { Link } from "react-router-dom";
import { db } from "../lib/firebase";
import { useAuth } from "../context/AuthContext";
import { content, SUBJECT_NAMES, useContent } from "../lib/content";
import { daysBetween, istToday, percent, timeAgo, titleCase, toDate } from "../lib/format";
import { recommendNext, summarizeProgress, weakTopics, type Recommendation } from "../lib/planner";
import { useDoc, useQueryOnce } from "../hooks/useFirestore";
import { AsyncState, EmptyState, PageHeader, ProgressBar, StatTile, Tag } from "../components/ui";
import { GOAL_LABELS, MISTAKE_LABELS, type ChallengeCompletionDoc, type DailyActivityDoc, type LedgerTransactionDoc, type ModuleProgressDoc, type NotificationDoc, type PublicProfile, type StudyPlanDoc, type TopicProgressDoc } from "../lib/types";

export default function DashboardPage() {
  const { user, profile, streak } = useAuth();
  const uid = user?.uid ?? "";
  const today = istToday();
  const [recommendation, setRecommendation] = useState<Recommendation | null>(null);

  const topics = useContent(() => content.allTopics(), []);
  const challenges = useContent(() => content.challenges(), []);
  const progress = useQueryOnce<TopicProgressDoc>(() => (uid ? query(collection(db, `studentProgress/${uid}/topics`)) : null), [uid]);
  const modules = useQueryOnce<ModuleProgressDoc>(() => (uid ? query(collection(db, `studentProgress/${uid}/modules`)) : null), [uid]);
  const activity = useDoc<DailyActivityDoc>(uid ? `dailyActivity/${uid}_${today}` : null);
  const plan = useDoc<StudyPlanDoc>(uid ? `studyPlans/${uid}` : null);
  const challengeDone = useDoc<ChallengeCompletionDoc>(uid ? `challengeCompletions/${uid}_${today}` : null);
  const publicProfile = useDoc<PublicProfile>(uid ? `publicProfiles/${uid}` : null);
  const recent = useQueryOnce<LedgerTransactionDoc>(() => (uid ? query(collection(db, "xpTransactions"), where("userId", "==", uid), orderBy("createdAt", "desc"), limit(5)) : null), [uid]);
  const notifications = useQueryOnce<NotificationDoc>(() => (uid ? query(collection(db, `notifications/${uid}/items`), where("read", "==", false), limit(20)) : null), [uid]);
  const [dismissed, setDismissed] = useState<string[]>([]);

  const topicNames = useMemo(() => new Map((topics.data ?? []).map((topic) => [topic.id, topic])), [topics.data]);
  const fullTopicCount = (topics.data ?? []).filter((topic) => topic.hasContent).length;
  const summaries = useMemo(
    () => progress.data.map((item) => summarizeProgress(item, topicNames.get(item.topicId)?.name ?? titleCase(item.topicId), SUBJECT_NAMES[item.subjectId] ?? item.subjectId, toDate(item.lastPracticedAt))),
    [progress.data, topicNames]
  );
  const weak = weakTopics(summaries);
  const weakSubjects = Array.from(new Set(weak.map((topic) => topic.subjectName)));
  const totalAttempts = progress.data.reduce((sum, item) => sum + item.attempts, 0);
  const accuracy = totalAttempts === 0 ? 0 : progress.data.reduce((sum, item) => sum + item.accuracy * item.attempts, 0) / totalAttempts;
  const completedModules = modules.data.filter((item) => item.status === "completed");
  const startedModules = modules.data.filter((item) => item.status === "started");
  // Rough progress: each full topic has about three modules in the seeded content.
  const overallProgress = fullTopicCount === 0 ? 0 : Math.min(100, (completedModules.length / (fullTopicCount * 3)) * 100);
  const targetMinutes = plan.data?.minutesPerDay ?? 60;
  const todayMinutes = activity.data?.minutes ?? 0;
  const challengePool = challenges.data ?? [];
  const todaysChallenge = challengePool.length ? challengePool[((daysBetween("2026-01-01", today) % challengePool.length) + challengePool.length) % challengePool.length] : null;

  function reveal() {
    const pending = startedModules[0] ? { moduleId: startedModules[0].moduleId, title: titleCase(startedModules[0].moduleId.split("-").slice(-1)[0]) } : null;
    setRecommendation(recommendNext(summaries, pending, Boolean(challengeDone.data)));
  }

  async function markRead(notificationId: string) {
    setDismissed((previous) => [...previous, notificationId]);
    try {
      await updateDoc(doc(db, `notifications/${uid}/items/${notificationId}`), { read: true });
    } catch (error) {
      console.error("Could not mark notification read", error);
    }
  }

  const loading = topics.loading || progress.loading || modules.loading || activity.loading || plan.loading;
  const error = topics.error ?? progress.error ?? modules.error ?? activity.error ?? plan.error;
  const unread = notifications.data.filter((item) => !dismissed.includes(item.id));

  return (
    <div>
      <PageHeader
        title={`Hi ${profile?.name?.split(" ")[0] ?? "there"}`}
        subtitle={profile ? `Class ${profile.classLevel} · ${profile.board} · ${GOAL_LABELS[profile.goal]}` : undefined}
        action={<Link to="/ai-tutor" className="btn-secondary">Ask AI Tutor</Link>}
      />

      <section className="card mb-6 bg-brand-600 text-white" aria-labelledby="cta-heading">
        <h2 id="cta-heading" className="text-lg font-semibold">What should I study now?</h2>
        {recommendation ? (
          <div className="mt-2">
            <p className="text-xl font-bold">{recommendation.title}</p>
            <p className="mt-1 text-sm text-brand-100">{recommendation.reason}</p>
            <Link to={recommendation.link} className="btn mt-3 bg-white text-brand-700 hover:bg-brand-50">Start ({recommendation.minutes} min)</Link>
          </div>
        ) : (
          <button type="button" className="btn mt-3 bg-white text-brand-700 hover:bg-brand-50" onClick={reveal} disabled={loading}>
            {loading ? "Checking your progress..." : "Show my next best action"}
          </button>
        )}
      </section>

      <AsyncState loading={loading} error={error} onRetry={progress.reload}>
        <div className="mb-6 grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <StatTile label="Today" value={`${todayMinutes} / ${targetMinutes} min`} hint="study target" to="/planner" />
          <StatTile label="Streak" value={`${streak?.current ?? 0} days`} hint={`Longest ${streak?.longest ?? 0}`} />
          <StatTile label="XP" value={profile?.xp ?? 0} to="/progress" />
          <StatTile label="Stars" value={profile?.stars ?? 0} to="/rewards" />
          <StatTile label="Solved" value={profile?.questionsSolved ?? 0} hint={`${percent(accuracy)} accuracy`} />
          <StatTile label="Progress" value={percent(overallProgress)} hint={`${completedModules.length} modules done`} to="/learn" />
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <div className="space-y-4">
            <section className="card" aria-labelledby="weak-heading">
              <h2 id="weak-heading" className="font-semibold">Weak topics</h2>
              {weakSubjects.length > 0 && <p className="mt-1 text-sm text-ink-500">Subjects needing attention: {weakSubjects.join(", ")}</p>}
              {weak.length === 0 ? (
                <p className="mt-2 text-sm text-ink-500">No weak topics detected yet. Solve a few problems so we can spot patterns.</p>
              ) : (
                <ul className="mt-3 space-y-3">
                  {weak.slice(0, 3).map((topic) => (
                    <li key={topic.topicId}>
                      <div className="flex items-center justify-between text-sm">
                        <Link to={`/learn/topic/${topic.topicId}`} className="font-medium text-brand-700">{topic.topicName}</Link>
                        <span className="text-ink-500">{topic.subjectName}</span>
                      </div>
                      <ProgressBar value={topic.accuracy} label="Accuracy" tone={topic.accuracy < 50 ? "warn" : "brand"} />
                      {topic.mainMistake && <p className="mt-1 text-xs text-ink-500">Main issue: {MISTAKE_LABELS[topic.mainMistake]}</p>}
                    </li>
                  ))}
                </ul>
              )}
              <Link to="/revision" className="btn-ghost mt-3">Open revision plan</Link>
            </section>

            <section className="card" aria-labelledby="challenge-heading">
              <h2 id="challenge-heading" className="font-semibold">Daily challenge</h2>
              {todaysChallenge ? (
                <>
                  <p className="mt-1 text-sm text-ink-700">{todaysChallenge.title} · {todaysChallenge.questionIds.length} questions · {Math.round(todaysChallenge.timeLimitSec / 60)} min</p>
                  {challengeDone.data ? (
                    <Tag tone="success">Completed today: {challengeDone.data.score}/{challengeDone.data.total}</Tag>
                  ) : (
                    <Link to="/challenges" className="btn-primary mt-3">Take today's challenge</Link>
                  )}
                </>
              ) : (
                <p className="mt-1 text-sm text-ink-500">No challenge available yet.</p>
              )}
            </section>

            <section className="card" aria-labelledby="twin-heading">
              <h2 id="twin-heading" className="font-semibold">Study Twin</h2>
              <p className="mt-1 text-sm text-ink-700">
                {publicProfile.data?.twinStatus === "matched" ? "You are matched. Compare progress or start a challenge." : publicProfile.data?.twinStatus === "searching" ? "Looking for a twin with the same class and goal." : "Find a peer with the same class and goal to study alongside."}
              </p>
              <Link to="/study-twin" className="btn-ghost mt-2">Open Study Twin</Link>
            </section>
          </div>

          <div className="space-y-4">
            <section className="card" aria-labelledby="recent-heading">
              <h2 id="recent-heading" className="font-semibold">Recent activity</h2>
              <AsyncState loading={recent.loading} error={recent.error} empty={recent.data.length === 0} emptyTitle="No activity yet" emptyBody="Complete a module or solve a problem to see it here." loadingLabel="Loading activity...">
                <ul className="mt-2 divide-y divide-ink-100 text-sm">
                  {recent.data.map((item) => (
                    <li key={item.id} className="flex justify-between py-2">
                      <span>{titleCase(item.reason)}</span>
                      <span className="text-ink-500">+{item.amount} XP · {timeAgo(item.createdAt)}</span>
                    </li>
                  ))}
                </ul>
              </AsyncState>
            </section>

            <section className="card" aria-labelledby="revision-heading">
              <h2 id="revision-heading" className="font-semibold">Upcoming revision</h2>
              {weak.length === 0 ? (
                <p className="mt-1 text-sm text-ink-500">Nothing queued. Keep practising and revision cards will appear.</p>
              ) : (
                <ul className="mt-2 space-y-1 text-sm">
                  {weak.slice(0, 3).map((topic) => (
                    <li key={topic.topicId}><Link to="/revision" className="text-brand-700">{topic.topicName}</Link> <span className="text-ink-500">({topic.subjectName})</span></li>
                  ))}
                </ul>
              )}
            </section>

            <section className="card" aria-labelledby="notif-heading">
              <h2 id="notif-heading" className="font-semibold">Notifications {unread.length > 0 && <Tag tone="brand">{unread.length}</Tag>}</h2>
              {unread.length === 0 ? (
                <p className="mt-1 text-sm text-ink-500">You are all caught up.</p>
              ) : (
                <ul className="mt-2 space-y-2 text-sm">
                  {unread.slice(0, 5).map((item) => (
                    <li key={item.id} className="flex items-start justify-between gap-2 rounded-lg bg-ink-100 p-2">
                      <div>
                        <p className="font-medium">{item.title}</p>
                        <p className="text-ink-500">{item.body}</p>
                        {item.link && <Link to={item.link} className="text-brand-700">Open</Link>}
                      </div>
                      <button type="button" className="btn-ghost" onClick={() => markRead(item.id)} aria-label={`Dismiss ${item.title}`}>✓</button>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        </div>

        {progress.data.length === 0 && modules.data.length === 0 && (
          <div className="mt-4">
            <EmptyState title="Your learning journey starts here" body="Pick a chapter from the NCERT hub or jump straight into the Problem Lab." action={<Link to="/ncert" className="btn-primary">Browse NCERT</Link>} />
          </div>
        )}
      </AsyncState>
    </div>
  );
}
