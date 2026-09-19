import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { api, type OutcomeResult, type QuizResults } from "../lib/callables";
import { content, useContent } from "../lib/content";
import { formatDuration, newId } from "../lib/format";
import { supabaseService } from "../lib/supabase";
import { useAction } from "../hooks/useFirestore";
import { AsyncState, InlineError, PageHeader, ProgressBar, RewardToast, Tag } from "../components/ui";
import { LEVEL_NAMES, type Level } from "../lib/types";

interface QuizOutcome {
  score: number;
  total: number;
  results: QuizResults;
  firstCompletion: boolean;
  levelUnlocked?: Level;
  accuracy: number;
}

export default function QuizPage() {
  const { quizId = "" } = useParams<{ quizId: string }>();
  const { user } = useAuth();
  const quiz = useContent(() => content.quiz(quizId), [quizId]);
  const questions = useContent(() => (quiz.data ? content.questions(quiz.data.questionIds) : Promise.resolve([])), [quiz.data?.id]);
  const questionKeys = useContent(() => (quiz.data ? content.questionKeys(quiz.data.questionIds) : Promise.resolve([])), [quiz.data?.id]);

  const attemptId = useRef(newId());
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);
  const [outcome, setOutcome] = useState<QuizOutcome | null>(null);
  const [toast, setToast] = useState<OutcomeResult | null>(null);

  const submit = useAction(
    useCallback(async () => {
      const qList = questions.data ?? [];
      const total = qList.length;

      try {
        const result = await api.finalizeQuiz({ attemptId: attemptId.current, quizId, answers });
        const accuracy = total > 0 ? Math.round((result.score / total) * 100) : 0;
        const out: QuizOutcome = {
          score: result.score,
          total: result.total,
          results: result.results,
          firstCompletion: result.firstCompletion ?? false,
          levelUnlocked: result.levelUnlocked,
          accuracy
        };
        setOutcome(out);

        // Save attempt to Supabase
        if (user?.uid) {
          await supabaseService.saveQuizAttempt(user.uid, quizId, result.score, total, result.results);
        }

        if (result.rewards && !result.alreadyFinalized) setToast(result.rewards);
        return result;
      } catch {
        // Local evaluation fallback using loaded question keys
        const keys = questionKeys.data ?? [];
        const keyMap = new Map(keys.map((k) => [k.id, k]));
        const results: QuizResults = {};
        let score = 0;

        for (const q of qList) {
          const key = keyMap.get(q.id);
          const chosen = answers[q.id];
          const correctIdx = key ? key.correctIndex : 0;
          const isCorrect = chosen !== undefined && chosen === correctIdx;
          if (isCorrect) score += 1;
          results[q.id] = {
            correctIndex: correctIdx,
            correct: isCorrect,
            explanation: key?.explanation || "Review the core concepts in the study module."
          };
        }

        const accuracy = total > 0 ? Math.round((score / total) * 100) : 0;
        const out: QuizOutcome = {
          score,
          total,
          results,
          firstCompletion: true,
          accuracy
        };
        setOutcome(out);

        // Save attempt to Supabase
        if (user?.uid) {
          await supabaseService.saveQuizAttempt(user.uid, quizId, score, total, results);
        }

        setToast({
          xp: score * 20,
          stars: score * 5,
          streak: { current: 1, longest: 1, incremented: true, milestones: [], qualifiedToday: true },
          badges: score === total ? ["quiz_ace"] : []
        });

        return { score, total, results };
      }
    }, [quizId, answers, questions.data, questionKeys.data, user?.uid])
  );

  const submitRef = useRef(submit.run);
  submitRef.current = submit.run;

  useEffect(() => {
    if (!quiz.data || outcome) return;
    setSecondsLeft(quiz.data.timeLimitSec);
    const timer = setInterval(() => {
      setSecondsLeft((previous) => {
        if (previous === null) return previous;
        if (previous <= 1) {
          clearInterval(timer);
          submitRef.current();
          return 0;
        }
        return previous - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [quiz.data?.id, outcome]);

  const list = questions.data ?? [];
  const answered = Object.keys(answers).length;

  // Filter wrong answers for review
  const wrongQuestions = outcome
    ? list.filter((q) => outcome.results[q.id] && !outcome.results[q.id].correct)
    : [];

  return (
    <AsyncState loading={quiz.loading || questions.loading} error={quiz.error ?? questions.error} empty={!quiz.loading && !quiz.data} emptyTitle="Quiz not found">
      {quiz.data && (
        <div className="mx-auto max-w-3xl">
          <PageHeader
            title={quiz.data.title}
            subtitle={<>Level {quiz.data.level} {LEVEL_NAMES[quiz.data.level]} · {list.length} questions · <Link to={`/learn/topic/${quiz.data.topicId}`} className="text-brand-700">Back to topic</Link></>}
            action={!outcome && secondsLeft !== null ? <Tag tone={secondsLeft < 30 ? "danger" : "brand"}>Time left: {formatDuration(secondsLeft)}</Tag> : undefined}
          />

          {list.length === 0 ? (
            <div className="card text-sm text-ink-500">This quiz has no questions yet.</div>
          ) : (
            <form
              onSubmit={(event) => {
                event.preventDefault();
                if (!outcome) submit.run();
              }}
              className="space-y-4"
            >
              {/* Question list */}
              {list.map((question, index) => {
                const result = outcome?.results[question.id];
                return (
                  <fieldset key={question.id} className={`card ${result ? (result.correct ? "border-success-500 bg-success-50/10" : "border-danger-400 bg-danger-50/10") : ""}`} disabled={Boolean(outcome)}>
                    <legend className="font-semibold text-ink-900">{index + 1}. {question.text}</legend>
                    <div className="mt-3 space-y-1.5">
                      {question.options.map((option, optionIndex) => {
                        const chosen = answers[question.id] === optionIndex;
                        const isCorrect = result?.correctIndex === optionIndex;
                        return (
                          <label
                            key={optionIndex}
                            className={`flex cursor-pointer items-center gap-2.5 rounded-lg border px-3 py-2 text-sm transition-colors ${
                              isCorrect
                                ? "border-success-500 bg-success-100/40 text-success-900 font-medium"
                                : chosen && result && !result.correct
                                ? "border-danger-400 bg-danger-100/40 text-danger-900"
                                : chosen
                                ? "border-brand-500 bg-brand-50 text-brand-900"
                                : "border-ink-200 hover:bg-ink-50"
                            }`}
                          >
                            <input
                              type="radio"
                              name={question.id}
                              checked={chosen}
                              onChange={() => setAnswers((previous) => ({ ...previous, [question.id]: optionIndex }))}
                            />
                            <span>{option}</span>
                          </label>
                        );
                      })}
                    </div>
                    {result && (
                      <div className={`mt-3 rounded-md p-2.5 text-xs ${result.correct ? "bg-success-50 text-success-800" : "bg-danger-50 text-danger-800"}`}>
                        <span className="font-bold">{result.correct ? "✓ Correct: " : "✗ Incorrect: "}</span>
                        {result.explanation}
                      </div>
                    )}
                  </fieldset>
                );
              })}

              {/* Scored Outcome Header */}
              {outcome ? (
                <div className="space-y-4">
                  <div className="card border-2 border-brand-300 bg-brand-50/30 p-5">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <h2 className="text-2xl font-bold text-ink-900">
                          Score: {outcome.score} / {outcome.total}
                        </h2>
                        <p className="text-sm font-semibold text-brand-700">
                          Accuracy: {outcome.accuracy}% · Saved to Supabase
                        </p>
                      </div>
                      <div className="rounded-full bg-brand-100 px-4 py-1 text-sm font-bold text-brand-800">
                        {outcome.accuracy >= 80 ? "Mastery Achieved! 🏆" : outcome.accuracy >= 50 ? "Good Attempt 👍" : "Needs Revision 📚"}
                      </div>
                    </div>
                    <div className="mt-3">
                      <ProgressBar label="Accuracy" value={outcome.accuracy} tone={outcome.accuracy >= 70 ? "success" : "brand"} />
                    </div>
                    <div className="mt-4 flex flex-wrap gap-2">
                      <Link to={`/learn/topic/${quiz.data.topicId}`} className="btn-secondary">Back to Topic</Link>
                      <Link to={`/problem-lab?topic=${quiz.data.topicId}`} className="btn-primary">Practice in Problem Lab</Link>
                      <Link to="/revision" className="btn-ghost">Review in Revision Hub</Link>
                    </div>
                  </div>

                  {/* Wrong-Answer Review Section */}
                  {wrongQuestions.length > 0 && (
                    <div className="card border border-danger-200 bg-danger-50/20 p-5">
                      <div className="flex items-center justify-between">
                        <h3 className="font-bold text-danger-800">
                          Wrong-Answer Review ({wrongQuestions.length} Questions Missed)
                        </h3>
                        <span className="text-xs text-danger-600 font-medium">Concept Diagnostics</span>
                      </div>
                      <p className="mt-1 text-xs text-ink-600">
                        Review the questions below carefully to solidify the core principle and avoid these mistakes in your final exams.
                      </p>

                      <div className="mt-4 space-y-4">
                        {wrongQuestions.map((q, idx) => {
                          const res = outcome.results[q.id];
                          const chosenIdx = answers[q.id];
                          const chosenText = chosenIdx !== undefined ? q.options[chosenIdx] : "Unanswered";
                          const correctText = res ? q.options[res.correctIndex] : "";

                          return (
                            <div key={q.id} className="rounded-lg border border-danger-200 bg-white p-3.5 text-sm">
                              <p className="font-semibold text-ink-900">{idx + 1}. {q.text}</p>
                              <div className="mt-2 space-y-1 text-xs">
                                <p className="text-danger-700">
                                  <strong className="font-semibold">Your Answer:</strong> {chosenText}
                                </p>
                                <p className="text-success-800">
                                  <strong className="font-semibold">Correct Answer:</strong> {correctText}
                                </p>
                              </div>
                              <div className="mt-2 rounded bg-ink-50 p-2 text-xs text-ink-700">
                                <span className="font-semibold text-ink-900">Explanation: </span>
                                {res?.explanation}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="card">
                  <p className="text-sm text-ink-500">{answered} of {list.length} answered. Unanswered questions count as wrong. Your attempt and accuracy will be saved to Supabase.</p>
                  <InlineError message={submit.error} />
                  <button type="submit" className="btn-primary mt-3" disabled={submit.busy}>{submit.busy ? "Scoring and Saving..." : "Submit quiz"}</button>
                </div>
              )}
            </form>
          )}
          <RewardToast result={toast} onDone={() => setToast(null)} />
        </div>
      )}
    </AsyncState>
  );
}
