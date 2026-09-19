import { useEffect, useMemo, useRef, useState } from "react";
import { collection } from "firebase/firestore";
import { useAuth } from "../context/AuthContext";
import { content, useContent } from "../lib/content";
import { api, type OutcomeResult, type QuizResults } from "../lib/callables";
import { daysBetween, formatDuration, istToday } from "../lib/format";
import { db } from "../lib/firebase";
import { useAction, useDoc, useQueryOnce } from "../hooks/useFirestore";
import { AsyncState, InlineError, PageHeader, ProgressBar, RewardToast, Tag } from "../components/ui";
import type { ChallengeCompletionDoc, DailyChallengeDoc, QuestionDoc } from "../lib/types";

const STREAK_MILESTONES = [1, 7, 30, 50, 100];

function todaysChallenge(challenges: DailyChallengeDoc[]): DailyChallengeDoc | null {
  if (challenges.length === 0) return null;
  const count = challenges.length;
  const index = ((daysBetween("2026-01-01", istToday()) % count) + count) % count;
  return challenges[index];
}

export default function ChallengesPage() {
  const { user, streak } = useAuth();
  const uid = user?.uid ?? "";
  const today = istToday();
  const challenges = useContent(() => content.challenges(), []);
  const challenge = useMemo(() => todaysChallenge(challenges.data ?? []), [challenges.data]);
  const completion = useDoc<ChallengeCompletionDoc & { results?: QuizResults }>(uid ? `challengeCompletions/${uid}_${today}` : null);
  const badges = useQueryOnce<{ badgeId: string }>(() => (uid ? collection(db, `userBadges/${uid}/badges`) : null), [uid]);

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader title="Daily Challenge" subtitle="Five quick questions. Finish once per day to earn XP and Stars, and the questions count toward today's streak." />
      <AsyncState loading={challenges.loading || completion.loading} error={challenges.error ?? completion.error} empty={!challenge} emptyTitle="No challenge available" emptyBody="Challenges are seeded by the team. Check back soon.">
        {challenge && (completion.data ? <CompletedView challenge={challenge} completion={completion.data} /> : <ChallengeRunner challenge={challenge} onFinished={completion.reload} />)}
      </AsyncState>

      <section className="card mt-6">
        <h2 className="text-lg font-semibold">Streak milestones</h2>
        <p className="mt-1 text-sm text-ink-500">Current streak: {streak?.current ?? 0} days. Longest: {streak?.longest ?? 0} days. A day counts only for real learning, never for logging in.</p>
        <ul className="mt-4 grid gap-3 sm:grid-cols-5">
          {STREAK_MILESTONES.map((milestone) => {
            const reached = (streak?.current ?? 0) >= milestone;
            return (
              <li key={milestone} className={`rounded-lg border p-3 text-center ${reached ? "border-success-500 bg-success-500/10" : "border-ink-200"}`}>
                <p className="text-xl font-bold">{milestone}</p>
                <p className="text-xs text-ink-500">{milestone === 1 ? "day" : "days"}</p>
                <p className="mt-1 text-xs font-semibold">{reached ? "Reached" : "Locked"}</p>
              </li>
            );
          })}
        </ul>
        <div className="mt-4">
          <ProgressBar label="Progress to 100-day goodie" value={Math.min(100, streak?.current ?? 0)} tone="success" />
        </div>
        <AsyncState loading={badges.loading} error={badges.error} empty={badges.data.length === 0} emptyTitle="No badges yet" emptyBody="Complete a module or solve problems to earn your first badge.">
          <div className="mt-4 flex flex-wrap gap-2">
            {badges.data.map((badge) => (
              <Tag key={badge.badgeId} tone="brand">{badge.badgeId.replace(/_/g, " ")}</Tag>
            ))}
          </div>
        </AsyncState>
      </section>
    </div>
  );
}

function CompletedView({ challenge, completion }: { challenge: DailyChallengeDoc; completion: ChallengeCompletionDoc & { results?: QuizResults } }) {
  const questions = useContent(() => content.questions(challenge.questionIds), [challenge.id]);
  return (
    <section className="card">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">{challenge.title}</h2>
        <Tag tone="success">Completed today</Tag>
      </div>
      <p className="mt-2 text-2xl font-bold">{completion.score} / {completion.total}</p>
      <p className="text-sm text-ink-500">Rewards for today's challenge were granted once. Come back tomorrow for a new one.</p>
      <AsyncState loading={questions.loading} error={questions.error}>
        <ol className="mt-4 space-y-3">
          {(questions.data ?? []).map((question, index) => {
            const result = completion.results?.[question.id];
            return (
              <li key={question.id} className="rounded-lg border border-ink-200 p-3">
                <p className="font-medium">{index + 1}. {question.text}</p>
                {result && (
                  <>
                    <p className={`mt-1 text-sm ${result.correct ? "text-success-500" : "text-danger-500"}`}>
                      {result.correct ? "Correct" : `Incorrect. Correct answer: ${question.options[result.correctIndex]}`}
                    </p>
                    <p className="mt-1 text-sm text-ink-700">{result.explanation}</p>
                  </>
                )}
              </li>
            );
          })}
        </ol>
      </AsyncState>
    </section>
  );
}

function ChallengeRunner({ challenge, onFinished }: { challenge: DailyChallengeDoc; onFinished: () => void }) {
  const questions = useContent(() => content.questions(challenge.questionIds), [challenge.id]);
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [secondsLeft, setSecondsLeft] = useState(challenge.timeLimitSec);
  const [outcome, setOutcome] = useState<{ score: number; total: number; results?: QuizResults; rewards?: OutcomeResult } | null>(null);
  const [toast, setToast] = useState<OutcomeResult | null>(null);
  const submittedRef = useRef(false);
  const submit = useAction(async () => {
    if (submittedRef.current) return null;
    submittedRef.current = true;
    const result = await api.completeDailyChallenge({ challengeId: challenge.id, answers });
    setOutcome(result);
    if (result.rewards) setToast(result.rewards);
    return result;
  });

  useEffect(() => {
    if (outcome) return;
    const timer = setInterval(() => setSecondsLeft((value) => Math.max(0, value - 1)), 1000);
    return () => clearInterval(timer);
  }, [outcome]);

  useEffect(() => {
    if (secondsLeft === 0 && !outcome && !submittedRef.current) void submit.run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [secondsLeft]);

  return (
    <section className="card">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-semibold">{challenge.title}</h2>
        <span className="text-sm font-semibold" aria-live="polite">Time left: {formatDuration(secondsLeft)}</span>
      </div>
      <AsyncState loading={questions.loading} error={questions.error} empty={(questions.data ?? []).length === 0} emptyTitle="Questions missing" emptyBody="This challenge has no questions seeded.">
        <ol className="mt-4 space-y-4">
          {(questions.data ?? []).map((question: QuestionDoc, index) => {
            const result = outcome?.results?.[question.id];
            return (
              <li key={question.id} className="rounded-lg border border-ink-200 p-3">
                <p className="font-medium">{index + 1}. {question.text}</p>
                <div className="mt-2 grid gap-2 sm:grid-cols-2">
                  {question.options.map((option, optionIndex) => (
                    <label key={optionIndex} className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm ${answers[question.id] === optionIndex ? "border-brand-500 bg-brand-50" : "border-ink-200"}`}>
                      <input type="radio" name={question.id} value={optionIndex} disabled={Boolean(outcome)} checked={answers[question.id] === optionIndex} onChange={() => setAnswers((previous) => ({ ...previous, [question.id]: optionIndex }))} />
                      {option}
                    </label>
                  ))}
                </div>
                {result && (
                  <p className={`mt-2 text-sm ${result.correct ? "text-success-500" : "text-danger-500"}`}>
                    {result.correct ? "Correct." : `Incorrect. Correct answer: ${question.options[result.correctIndex]}.`} {result.explanation}
                  </p>
                )}
              </li>
            );
          })}
        </ol>
        {outcome ? (
          <div className="mt-4 rounded-lg bg-success-500/10 p-4">
            <p className="text-xl font-bold">Score: {outcome.score} / {outcome.total}</p>
            <p className="text-sm text-ink-700">Rewards granted once for today. Your streak counts these questions.</p>
            <button type="button" className="btn-secondary mt-3" onClick={onFinished}>Done</button>
          </div>
        ) : (
          <div className="mt-4">
            <button type="button" className="btn-primary" disabled={submit.busy} onClick={() => void submit.run()}>
              {submit.busy ? "Submitting..." : "Submit challenge"}
            </button>
            <InlineError message={submit.error} />
          </div>
        )}
      </AsyncState>
      <RewardToast result={toast} onDone={() => setToast(null)} />
    </section>
  );
}
