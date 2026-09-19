import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import ReactMarkdown from "react-markdown";
import { collection, limit, orderBy, query, where } from "firebase/firestore";
import { db } from "../lib/firebase";
import { api } from "../lib/callables";
import { content, SUBJECT_NAMES, useContent } from "../lib/content";
import { newId } from "../lib/format";
import { useAuth } from "../context/AuthContext";
import { useAction, useLiveQuery } from "../hooks/useFirestore";
import { AiLabel, InlineError, PageHeader, Spinner } from "../components/ui";
import type { AiMessageDoc, AiMode, ClassLevel, SubjectId } from "../lib/types";

const MODES: { mode: AiMode; label: string; placeholder: string }[] = [
  { mode: "explain", label: "Explain Concept", placeholder: "Ask any question (e.g., Photosynthesis, Python recursion, Newton's 3rd Law, Organic Chemistry)..." },
  { mode: "solve_with_me", label: "Solve With Me", placeholder: "Paste the math problem, science question, or coding puzzle to solve together step-by-step..." },
  { mode: "hint", label: "Give Hint", placeholder: "Describe the problem and where you are currently stuck..." },
  { mode: "generate_questions", label: "Practice Questions", placeholder: "Request MCQs, numerical problems, or code exercises for any topic..." },
  { mode: "check_answer", label: "Check My Answer", placeholder: "Paste the question you attempted..." },
  { mode: "find_mistake", label: "Find My Mistake", placeholder: "Paste the question and your step-by-step working or code..." },
  { mode: "revision", label: "Revision Sheet", placeholder: "Topic or chapter for a compact revision sheet (formulae, key points, traps)..." },
  { mode: "exam", label: "Exam Mode", placeholder: "Reply to the examiner, or leave empty to start a practice exam question..." }
];

const SUGGESTIONS = [
  "Explain Python loops and recursion with examples",
  "Derive the quadratic formula step-by-step",
  "How does active recall help in JEE/NEET prep?",
  "Explain light vs dark reaction in Photosynthesis",
  "Write a C++ program to check if a number is prime",
  "What is Lenz's Law and how do I apply it?"
];

const SESSION_KEY = "vidyapath.aiTutorSession";

function loadSessionId(): string {
  try {
    const existing = sessionStorage.getItem(SESSION_KEY);
    if (existing) return existing;
    const created = newId();
    sessionStorage.setItem(SESSION_KEY, created);
    return created;
  } catch (error) {
    console.warn("sessionStorage unavailable, using a fresh AI session", error);
    return newId();
  }
}

export default function AiTutorPage() {
  const { user, profile } = useAuth();
  const [params] = useSearchParams();
  const presetTopicId = params.get("topic");
  const classLevel = (profile?.classLevel ?? 10) as ClassLevel;
  const sessionIdRef = useRef(loadSessionId());

  const [mode, setMode] = useState<AiMode>("explain");
  const [subjectId, setSubjectId] = useState<SubjectId | "">("");
  const [chapterId, setChapterId] = useState("");
  const [topicId, setTopicId] = useState("");
  const [message, setMessage] = useState("");
  const [attemptAnswer, setAttemptAnswer] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const [remaining, setRemaining] = useState<number | null>(null);

  const presetTopic = useContent(() => (presetTopicId ? content.topic(presetTopicId) : Promise.resolve(null)), [presetTopicId]);
  useEffect(() => {
    if (presetTopic.data) {
      setSubjectId(presetTopic.data.subjectId);
      setChapterId(presetTopic.data.chapterId);
      setTopicId(presetTopic.data.id);
    }
  }, [presetTopic.data]);

  const subjects = useContent(() => content.subjects(), []);
  const chapters = useContent(() => (subjectId ? content.chapters(classLevel, subjectId) : Promise.resolve([])), [subjectId, classLevel]);
  const topics = useContent(() => (chapterId ? content.topics(chapterId) : Promise.resolve([])), [chapterId]);
  const subjectOptions = useMemo(() => (subjects.data ?? []).filter((subject) => subject.classLevels.includes(classLevel)), [subjects.data, classLevel]);

  const history = useLiveQuery<AiMessageDoc>(
    () => (user ? query(collection(db, `aiSessions/${user.uid}/messages`), where("sessionId", "==", sessionIdRef.current), orderBy("createdAt", "asc"), limit(25)) : null),
    [user?.uid]
  );

  const ask = useAction(api.askAi);
  const needsAnswer = mode === "check_answer" || mode === "find_mistake";
  const currentMode = MODES.find((entry) => entry.mode === mode) ?? MODES[0];

  const send = async (overrideMessage?: string) => {
    const textToSend = (overrideMessage !== undefined ? overrideMessage : message).trim();
    if (!textToSend && !needsAnswer && mode !== "exam") return;
    const response = await ask.run({
      sessionId: sessionIdRef.current,
      mode,
      message: textToSend,
      topicId: topicId || null,
      attemptAnswer: needsAnswer ? attemptAnswer.trim() : ""
    });
    if (!response) return;
    setNotice(response.notice);
    setRemaining(response.remaining);
    setMessage("");
  };

  const listEndRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    listEndRef.current?.scrollIntoView({ block: "end", behavior: "smooth" });
  }, [history.data.length, ask.busy]);

  return (
    <div>
      <PageHeader
        title="EduQuest Universal AI Tutor"
        subtitle="Ask any question across Physics, Chemistry, Maths, Biology, Computer Science, Coding, Exam Prep, Career Guidance, or Study Techniques. Module context is optional."
      />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <span className="text-xs font-semibold uppercase tracking-wider text-ink-500">Quick Prompts:</span>
        {SUGGESTIONS.map((suggestion) => (
          <button
            key={suggestion}
            type="button"
            className="rounded-full border border-ink-200 bg-white px-2.5 py-1 text-xs text-ink-700 hover:border-brand-500 hover:bg-brand-50 hover:text-brand-700 transition"
            onClick={() => {
              setMessage(suggestion);
              setMode("explain");
            }}
          >
            {suggestion}
          </button>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1.9fr)]">
        <section className="card space-y-4">
          <div>
            <label className="label">Tutor Mode</label>
            <div role="tablist" aria-label="Tutor modes" className="flex flex-wrap gap-1.5">
              {MODES.map((entry) => (
                <button
                  key={entry.mode}
                  type="button"
                  role="tab"
                  aria-selected={entry.mode === mode}
                  className={`rounded-full px-3 py-1 text-xs font-semibold transition ${entry.mode === mode ? "bg-brand-600 text-white shadow-sm" : "bg-ink-100 text-ink-700 hover:bg-ink-200"}`}
                  onClick={() => setMode(entry.mode)}
                >
                  {entry.label}
                </button>
              ))}
            </div>
          </div>

          <div className="rounded-xl border border-ink-150 bg-ink-50/60 p-3 space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-ink-700">Module Context (Optional)</span>
              <span className="text-[11px] text-ink-400">EduQuest answers any topic</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <div>
                <label htmlFor="tutor-subject" className="sr-only">Subject</label>
                <select id="tutor-subject" className="input text-xs" value={subjectId} onChange={(event) => { setSubjectId(event.target.value as SubjectId | ""); setChapterId(""); setTopicId(""); }}>
                  <option value="">Any Subject</option>
                  {subjectOptions.map((subject) => (
                    <option key={subject.id} value={subject.id}>{SUBJECT_NAMES[subject.id] ?? subject.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="tutor-chapter" className="sr-only">Chapter</label>
                <select id="tutor-chapter" className="input text-xs" value={chapterId} disabled={!subjectId || chapters.loading} onChange={(event) => { setChapterId(event.target.value); setTopicId(""); }}>
                  <option value="">Any Chapter</option>
                  {(chapters.data ?? []).filter((chapter) => !chapter.sampleOnly).map((chapter) => (
                    <option key={chapter.id} value={chapter.id}>{chapter.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="tutor-topic" className="sr-only">Topic</label>
                <select id="tutor-topic" className="input text-xs" value={topicId} disabled={!chapterId || topics.loading} onChange={(event) => setTopicId(event.target.value)}>
                  <option value="">Any Topic</option>
                  {(topics.data ?? []).map((topic) => (
                    <option key={topic.id} value={topic.id}>{topic.name}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {needsAnswer && (
            <div>
              <label htmlFor="tutor-answer" className="label">Your Working or Answer</label>
              <input id="tutor-answer" className="input" value={attemptAnswer} onChange={(event) => setAttemptAnswer(event.target.value)} placeholder="What did you get or what did you try?" />
            </div>
          )}

          <div>
            <label htmlFor="tutor-message" className="label">{currentMode.label}</label>
            <textarea
              id="tutor-message"
              className="input min-h-28"
              placeholder={currentMode.placeholder}
              value={message}
              onChange={(event) => setMessage(event.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                  e.preventDefault();
                  send();
                }
              }}
            />
            <span className="mt-1 block text-right text-[11px] text-ink-400">Press Ctrl+Enter to send</span>
          </div>

          <button
            type="button"
            className="btn-primary w-full py-2.5 font-semibold text-sm"
            disabled={ask.busy || (needsAnswer && !attemptAnswer.trim())}
            onClick={() => send()}
          >
            {ask.busy ? "EduQuest is thinking..." : "Ask EduQuest AI Tutor"}
          </button>

          <InlineError message={ask.error} />
          {remaining !== null && <p className="text-xs text-ink-500">{remaining} AI requests left today.</p>}
          <p className="text-[11px] text-ink-400">EduQuest can make mistakes. Always verify critical facts against standard textbooks.</p>
        </section>

        <section className="card flex flex-col justify-between min-h-[34rem]">
          <div>
            {notice && <p className="mb-3 rounded-lg bg-warn-500/10 p-2 text-xs text-warn-600 font-medium" role="status">{notice}</p>}
            {history.error && <p className="text-sm text-danger-500" role="alert">{history.error}</p>}
            {history.loading && <Spinner label="Loading conversation history..." />}
            {!history.loading && history.data.length === 0 && !ask.busy && (
              <div className="flex flex-col items-center justify-center py-12 text-center text-ink-500 space-y-2">
                <div className="rounded-full bg-brand-50 p-3 text-brand-600">
                  <span className="text-2xl">🎓</span>
                </div>
                <h3 className="font-semibold text-ink-800">Welcome to EduQuest AI Tutor</h3>
                <p className="text-sm max-w-sm text-ink-500">
                  I can help you with school subjects, coding (Python, C++, Java, JS, HTML/CSS), JEE/NEET prep, doubt solving, or study planning. Ask me anything!
                </p>
              </div>
            )}
            <div className="max-h-[32rem] space-y-3 overflow-y-auto pr-1" aria-live="polite">
              {history.data.map((entry) => (
                <div
                  key={entry.id}
                  className={`rounded-xl p-3.5 text-sm ${entry.role === "user" ? "ml-6 bg-brand-50 text-brand-900 border border-brand-100" : "mr-4 bg-ink-50 text-ink-900 border border-ink-150"}`}
                >
                  <div className="mb-1.5 flex items-center justify-between">
                    <span className="text-xs font-semibold text-ink-500">
                      {entry.role === "user" ? "You" : "EduQuest AI Tutor"}
                    </span>
                    {entry.role === "assistant" && <AiLabel source={entry.source} />}
                  </div>
                  <div className="prose prose-sm max-w-none text-ink-800 overflow-x-auto">
                    <ReactMarkdown>{entry.text}</ReactMarkdown>
                  </div>
                </div>
              ))}
              {ask.busy && (
                <div className="flex items-center gap-2 rounded-xl bg-ink-50 p-3 text-sm text-ink-600 border border-ink-150">
                  <Spinner label="EduQuest is generating your response..." />
                </div>
              )}
              <div ref={listEndRef} />
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
