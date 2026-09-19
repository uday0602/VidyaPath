import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api, type OutcomeResult, type PublicSolution } from "../lib/callables";
import { content, useContent } from "../lib/content";
import { formatDuration, newId } from "../lib/format";
import { useAuth } from "../context/AuthContext";
import { useAction, useDoc } from "../hooks/useFirestore";
import { AiLabel, AsyncState, InlineError, RewardToast, Spinner, Tag } from "../components/ui";
import { LEVEL_NAMES, MISTAKE_LABELS, type AiMode, type AiSource, type Framework, type MistakeType, type TopicProgressDoc } from "../lib/types";

const FRAMEWORK_STEPS: Record<Framework, string[]> = {
  physics: ["Given", "Find", "Concept", "Diagram", "Formula", "Substitute", "Calculate", "Unit Check", "Final Answer"],
  physical_chemistry: ["Given", "Formula", "Units", "Substitute", "Calculate", "Verify"],
  organic_chemistry: ["Reactant", "Functional Group", "Reaction Type", "Reagent", "Transformation", "Product"],
  inorganic_chemistry: ["Element/Compound", "Property", "Concept", "Trend/Reaction", "Reasoning", "Answer"],
  mathematics: ["Understand", "Given", "Find", "Concept", "Method", "Solve", "Verify"]
};

const MISTAKE_ADVICE: Record<MistakeType, string> = {
  concept: "Revise the concept and solve Level 1 and Level 2 problems.",
  formula: "Right idea, wrong tool. Re-read which formula fits the given quantities.",
  calculation: "The method was right. Redo the arithmetic slowly and check each substitution.",
  unit: "Your number is right but the unit is not. Always write units with the final answer.",
  sign: "Check sign conventions: direction, positive and negative roots, or charge.",
  misread: "Re-read the question and list exactly what is given and what is asked.",
  reasoning: "The chain of logic broke somewhere. Write each step and justify it.",
  time: "Too long on one problem. Practise Level 1 problems to build speed first."
};

const COACH_BUTTONS: { label: string; mode: AiMode }[] = [
  { label: "HINT", mode: "hint" },
  { label: "IDENTIFY CONCEPT", mode: "identify_concept" },
  { label: "GUIDE ME", mode: "guide" },
  { label: "CHECK MY APPROACH", mode: "check_approach" },
  { label: "FIND MY MISTAKE", mode: "find_mistake" },
  { label: "FULL EXPLANATION", mode: "full_explanation" }
];

interface CoachMessage {
  role: "user" | "assistant";
  text: string;
  source: AiSource | null;
  notice: string | null;
}

function stepKey(label: string): string {
  return label.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
}

export default function ProblemSolvePage() {
  const { problemId = "" } = useParams();
  const { user } = useAuth();
  const problem = useContent(() => content.problem(problemId), [problemId]);
  const progress = useDoc<TopicProgressDoc>(user && problem.data ? `studentProgress/${user.uid}/topics/${problem.data.topicId}` : null, [problem.data?.topicId]);

  const steps = useMemo(() => (problem.data ? FRAMEWORK_STEPS[problem.data.framework] : []), [problem.data]);
  const [stepIndex, setStepIndex] = useState(0);
  const [stepText, setStepText] = useState<Record<string, string>>({});
  const [finalAnswer, setFinalAnswer] = useState("");
  const [hintsShown, setHintsShown] = useState(0);
  const [result, setResult] = useState<Awaited<ReturnType<typeof api.submitProblemAttempt>> | null>(null);
  const [revealed, setRevealed] = useState<PublicSolution | null>(null);
  const [toast, setToast] = useState<OutcomeResult | null>(null);
  const attemptIdRef = useRef(newId());
  const sessionIdRef = useRef(newId());

  const startedAtRef = useRef(Date.now());
  const [elapsedSec, setElapsedSec] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => setElapsedSec(Math.floor((Date.now() - startedAtRef.current) / 1000)), 1000);
    return () => clearInterval(timer);
  }, []);
  useEffect(() => {
    const startedAt = startedAtRef.current;
    return () => {
      const elapsed = Math.floor((Date.now() - startedAt) / 1000);
      if (elapsed < 60 || !problemId) return;
      api.recordStudySession({ sessionId: newId(), topicId: problem.data?.topicId ?? null, minutes: Math.round(elapsed / 60), kind: "problems" }).catch((error) => console.error("Could not record study session", error));
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [problemId]);

  const submit = useAction(api.submitProblemAttempt);
  const reveal = useAction(api.revealSolution);

  const handleSubmit = async () => {
    if (!problem.data || !finalAnswer.trim()) return;
    const response = await submit.run({
      attemptId: attemptIdRef.current,
      problemId: problem.data.id,
      finalAnswer: finalAnswer.trim(),
      steps: stepText,
      timeSpentSec: elapsedSec
    });
    if (!response) return;
    setResult(response);
    attemptIdRef.current = newId();
    if (response.rewards && (response.rewards.xp > 0 || response.rewards.stars > 0 || response.rewards.streak.incremented)) setToast(response.rewards);
  };

  const tryAgain = () => {
    setResult(null);
    setFinalAnswer("");
    setStepIndex(steps.length - 1);
  };

  const [messages, setMessages] = useState<CoachMessage[]>([]);
  const [learningMode, setLearningMode] = useState(true);
  const [remaining, setRemaining] = useState<number | null>(null);
  const ask = useAction(api.askAi);

  const attemptStepsText = useMemo(
    () => steps.map((label) => `${label}: ${stepText[stepKey(label)] ?? ""}`).filter((line) => !line.endsWith(": ")).join("\n"),
    [steps, stepText]
  );

  const askCoach = useCallback(
    async (mode: AiMode, label: string) => {
      if (!problem.data) return;
      if (mode === "full_explanation" && !learningMode) {
        const solution = await reveal.run({ problemId: problem.data.id });
        if (solution) setRevealed(solution);
        return;
      }
      setMessages((previous) => [...previous, { role: "user", text: label, source: null, notice: null }]);
      const response = await ask.run({
        sessionId: sessionIdRef.current,
        mode,
        learningMode,
        problemId: problem.data.id,
        topicId: problem.data.topicId,
        attemptAnswer: finalAnswer,
        attemptSteps: attemptStepsText
      });
      if (!response) return;
      setRemaining(response.remaining);
      setMessages((previous) => [...previous, { role: "assistant", text: response.text, source: response.source, notice: response.notice }]);
    },
    [problem.data, learningMode, finalAnswer, attemptStepsText, ask, reveal]
  );

  const unlocked = progress.data?.levelUnlocked ?? 1;
  const locked = problem.data ? problem.data.level > unlocked : false;
  const isLastStep = stepIndex === steps.length - 1;
  const currentLabel = steps[stepIndex] ?? "";
  const currentKey = stepKey(currentLabel);

  return (
    <AsyncState loading={problem.loading || progress.loading} error={problem.error || progress.error} empty={!problem.data} loadingLabel="Loading problem..." emptyTitle="Problem not found" emptyBody={<Link to="/problem-lab" className="text-brand-600">Back to Problem Lab</Link>}>
      {problem.data && locked && (
        <div className="card">
          <p className="font-semibold">🔒 Level {problem.data.level} is locked for this topic.</p>
          <p className="mt-1 text-sm text-ink-500">You have unlocked up to Level {unlocked}. Score well on Level {unlocked} problems to move up.</p>
          <Link to={`/problem-lab?topic=${problem.data.topicId}&level=${unlocked}`} className="btn-primary mt-3">Practise Level {unlocked}</Link>
        </div>
      )}
      {problem.data && !locked && (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)_minmax(0,1fr)]">
          <section className="space-y-4">
            <div className="card">
              <Link to="/problem-lab" className="text-xs text-brand-600">← Problem Lab</Link>
              <h1 className="mt-2 text-lg font-bold">{problem.data.title}</h1>
              <p className="mt-2 whitespace-pre-line text-sm leading-relaxed">{problem.data.statement}</p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Tag tone="brand">{problem.data.concept}</Tag>
                <Tag>Level {problem.data.level}: {LEVEL_NAMES[problem.data.level]}</Tag>
                <Tag>{problem.data.marks} marks</Tag>
              </div>
              <p className="mt-3 text-xs text-ink-500">Expected {problem.data.expectedMinutes} min · Elapsed <span aria-live="off">{formatDuration(elapsedSec)}</span></p>
            </div>
            <div className="card">
              <p className="font-semibold">Hints</p>
              <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm">
                {problem.data.hints.slice(0, hintsShown).map((hint, index) => (
                  <li key={index}>{hint}</li>
                ))}
              </ol>
              {hintsShown < problem.data.hints.length ? (
                <button type="button" className="btn-secondary mt-3" onClick={() => setHintsShown((count) => count + 1)}>
                  Reveal hint {hintsShown + 1} of {problem.data.hints.length}
                </button>
              ) : (
                <p className="mt-2 text-xs text-ink-500">All hints shown.</p>
              )}
            </div>
          </section>

          <section className="space-y-4">
            {!result && !revealed && (
              <div className="card">
                <div className="mb-3 flex flex-wrap gap-1" role="tablist" aria-label="Solution steps">
                  {steps.map((label, index) => (
                    <button
                      key={label}
                      type="button"
                      role="tab"
                      aria-selected={index === stepIndex}
                      onClick={() => setStepIndex(index)}
                      className={`rounded-full px-2.5 py-1 text-xs font-semibold ${index === stepIndex ? "bg-brand-600 text-white" : stepText[stepKey(label)] ? "bg-success-500/15 text-success-500" : "bg-ink-200 text-ink-700"}`}
                    >
                      {index + 1}. {label}
                    </button>
                  ))}
                </div>
                <label htmlFor="step-input" className="label">Step {stepIndex + 1}: {currentLabel}</label>
                <textarea
                  id="step-input"
                  className="input min-h-28"
                  placeholder={`Write your ${currentLabel.toLowerCase()} here`}
                  value={stepText[currentKey] ?? ""}
                  onChange={(event) => setStepText((previous) => ({ ...previous, [currentKey]: event.target.value }))}
                />
                {isLastStep && (
                  <div className="mt-3">
                    <label htmlFor="final-answer" className="label">Final answer{problem.data.answerUnit ? ` (in ${problem.data.answerUnit})` : ""}</label>
                    <input id="final-answer" className="input" value={finalAnswer} onChange={(event) => setFinalAnswer(event.target.value)} placeholder={problem.data.answerType === "numeric" ? "Number with unit" : "Your answer"} />
                  </div>
                )}
                <div className="mt-4 flex flex-wrap gap-2">
                  <button type="button" className="btn-secondary" disabled={stepIndex === 0} onClick={() => setStepIndex((index) => index - 1)}>Back</button>
                  {!isLastStep && <button type="button" className="btn-primary" onClick={() => setStepIndex((index) => index + 1)}>Next step</button>}
                  {isLastStep && (
                    <button type="button" className="btn-primary" disabled={submit.busy || !finalAnswer.trim()} onClick={handleSubmit}>
                      {submit.busy ? "Checking..." : "Submit answer"}
                    </button>
                  )}
                </div>
                <InlineError message={submit.error} />
              </div>
            )}

            {result && result.correct && (
              <div className="card border-success-500/40 bg-green-50">
                <p className="font-semibold text-success-500">Correct! {result.rewarded ? "XP and Stars awarded." : "Already solved or revealed earlier, so no new reward."}</p>
                <p className="mt-1 text-sm text-ink-700">Topic accuracy now {result.accuracy}%. Suggested level: {result.suggestedLevel}.</p>
                {result.levelUnlocked > unlocked && <p className="mt-1 text-sm font-semibold text-brand-700">Level {result.levelUnlocked} unlocked!</p>}
                {result.solution && <SolutionView solution={result.solution} />}
                <div className="mt-4 flex flex-wrap gap-2">
                  {result.similarProblemIds.length > 0 && (
                    <Link to={`/problem-lab/${result.similarProblemIds[0]}`} className="btn-primary">Try a Similar Problem</Link>
                  )}
                  <Link to={`/problem-lab?topic=${problem.data.topicId}`} className="btn-secondary">Back to topic problems</Link>
                </div>
              </div>
            )}

            {result && !result.correct && (
              <div className="card border-danger-500/40 bg-red-50">
                <p className="font-semibold text-danger-500">Not quite. Mistake type: {result.mistakeType ? MISTAKE_LABELS[result.mistakeType] : "Unknown"}</p>
                <p className="mt-1 text-sm text-ink-700">{result.mistakeType ? MISTAKE_ADVICE[result.mistakeType] : "Review your steps and try again."}</p>
                <div className="mt-4 flex flex-wrap gap-2">
                  <button type="button" className="btn-primary" onClick={tryAgain}>Try again</button>
                  <button type="button" className="btn-secondary" disabled={ask.busy} onClick={() => askCoach("find_mistake", "FIND MY MISTAKE")}>Find My Mistake (AI)</button>
                </div>
              </div>
            )}

            {revealed && (
              <div className="card">
                <p className="font-semibold">Worked solution</p>
                <p className="mt-1 text-xs text-warn-500">Solution revealed: this problem no longer earns XP or Stars.</p>
                <SolutionView solution={revealed} />
                <Link to={`/problem-lab?topic=${problem.data.topicId}`} className="btn-secondary mt-4">Back to topic problems</Link>
              </div>
            )}
          </section>

          <section className="card">
            <div className="flex items-center justify-between">
              <p className="font-semibold">AI Problem Coach</p>
              <button
                type="button"
                className={`tag ${learningMode ? "bg-success-500/15 text-success-500" : "bg-ink-200 text-ink-700"}`}
                aria-pressed={learningMode}
                onClick={() => setLearningMode((value) => !value)}
              >
                Learning Mode: {learningMode ? "ON" : "OFF"}
              </button>
            </div>
            <p className="mt-1 text-xs text-ink-500">{learningMode ? "The coach guides you and holds back the final answer until you have tried." : "The coach may reveal the full solution."}</p>
            <div className="mt-3 grid grid-cols-2 gap-2">
              {COACH_BUTTONS.map((button) => (
                <button key={button.mode} type="button" className="btn-secondary text-xs" disabled={ask.busy || reveal.busy} onClick={() => askCoach(button.mode, button.label)}>
                  {button.label}
                </button>
              ))}
            </div>
            <InlineError message={ask.error || reveal.error} />
            <div className="mt-4 max-h-96 space-y-3 overflow-y-auto" aria-live="polite">
              {messages.length === 0 && !ask.busy && <p className="text-sm text-ink-500">Ask for a hint or let the coach check your approach.</p>}
              {messages.map((message, index) => (
                <div key={index} className={`rounded-lg p-3 text-sm ${message.role === "user" ? "bg-brand-50 text-brand-700" : "bg-ink-100"}`}>
                  {message.role === "assistant" && (
                    <div className="mb-1 flex flex-wrap gap-1">
                      <AiLabel source={message.source} />
                    </div>
                  )}
                  {message.notice && <p className="mb-1 text-xs text-warn-500">{message.notice}</p>}
                  <p className="whitespace-pre-line">{message.text}</p>
                </div>
              ))}
              {ask.busy && <Spinner label="Vidya is thinking..." />}
            </div>
            {remaining !== null && <p className="mt-2 text-xs text-ink-500">{remaining} AI requests left today.</p>}
          </section>
        </div>
      )}
      <RewardToast result={toast} onDone={() => setToast(null)} />
    </AsyncState>
  );
}

function SolutionView({ solution }: { solution: PublicSolution }) {
  return (
    <div className="mt-3">
      <ol className="space-y-2 text-sm">
        {solution.steps.map((step) => (
          <li key={step.label} className="rounded-lg bg-white p-2">
            <span className="font-semibold">{step.label}: </span>
            <span className="whitespace-pre-line">{step.content}</span>
          </li>
        ))}
      </ol>
      <p className="mt-2 text-sm font-semibold">Final answer: {solution.finalAnswer}</p>
      {solution.commonMistakes.length > 0 && (
        <div className="mt-3 text-sm">
          <p className="font-semibold">Common mistakes</p>
          <ul className="mt-1 list-disc pl-5">
            {solution.commonMistakes.map((mistake, index) => (
              <li key={index}><span className="font-medium">{MISTAKE_LABELS[mistake.type]}:</span> {mistake.description}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
