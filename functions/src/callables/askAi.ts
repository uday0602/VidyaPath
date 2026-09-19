import { FieldValue } from "firebase-admin/firestore";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { defineSecret } from "firebase-functions/params";
import { logger } from "firebase-functions/v2";
import { GoogleGenAI } from "@google/genai";
import { db, loadConfig, requireString, requireUid } from "../lib/admin.js";
import { istDate } from "../lib/time.js";
import { leaksFinalAnswer, validateAiText } from "../lib/aiValidate.js";
import { FALLBACK_NOTICE, fallbackResponse } from "../lib/aiFallback.js";
import type { AiMode, MistakeDoc, ProblemDoc, ProblemSolutionDoc, TopicDoc, UserDoc } from "../types.js";
import { GOAL_LABELS, MISTAKE_LABELS } from "../types.js";

const geminiApiKey = defineSecret("GEMINI_API_KEY");
const CANDIDATE_MODELS = ["gemini-3.7-flash", "gemini-3.5-flash-lite", "gemini-3.1-flash-lite", "gemini-3.8-flash", "gemini-3.6-flash"];
const TIMEOUT_MS = 25_000;
const REVEAL_AFTER_TURNS = 3;
const MODES = new Set<AiMode>([
  "hint", "identify_concept", "guide", "check_approach", "find_mistake", "full_explanation",
  "explain", "solve_with_me", "generate_questions", "check_answer", "revision", "exam"
]);
const GUIDANCE_MODES = new Set<AiMode>(["hint", "guide", "check_approach", "find_mistake", "solve_with_me"]);

interface AskAiInput {
  sessionId?: unknown;
  mode?: unknown;
  message?: unknown;
  learningMode?: unknown;
  problemId?: unknown;
  topicId?: unknown;
  attemptAnswer?: unknown;
  attemptSteps?: unknown;
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("AI request timed out")), ms);
    promise.then((value) => { clearTimeout(timer); resolve(value); }, (error) => { clearTimeout(timer); reject(error); });
  });
}

function buildSystemPrompt(user: UserDoc, topic: TopicDoc | null, problem: ProblemDoc | null, mistakes: MistakeDoc[], learningMode: boolean, guidanceTurns: number): string {
  const lines = [
    "You are EduQuest AI Tutor, an intelligent educational assistant for students from Classes 9–12 (CBSE, ICSE, State Boards), JEE, and NEET aspirants.",
    "",
    "## Your Role",
    "Answer any question the user asks, not just questions from the currently selected topic or module.",
    "",
    "You can help with:",
    "* Physics, Chemistry, Mathematics, Biology",
    "* English and other school subjects",
    "* Computer Science and Coding (C, C++, Python, Java, HTML, CSS, JavaScript)",
    "* General Knowledge",
    "* Study techniques",
    "* Exam preparation",
    "* Career guidance",
    "* Doubt solving",
    "* Logical reasoning",
    "* Everyday educational questions",
    "",
    "## Response Rules",
    "* Give accurate and complete answers.",
    "* Explain concepts in simple language first, then provide detailed explanations if needed.",
    "* When appropriate, include examples, formulas, diagrams (text-based), or step-by-step solutions.",
    "* If the user asks for MCQs, notes, summaries, or practice questions, generate them.",
    "* If the user asks coding questions, provide working code with explanation.",
    "* Adapt explanations to the student's level.",
    "",
    "## Context Awareness",
    "* If the user is inside a subject module, use that as helpful context, but never restrict your answers to that subject.",
    "* If the user switches topics, answer the new topic naturally.",
    "* Maintain conversation memory during the chat.",
    "",
    "## When the Question Is Unclear",
    "Ask a brief clarifying question instead of refusing.",
    "Example:",
    "* \"Can you share the exact math problem?\"",
    "* \"Which class are you studying in?\"",
    "",
    "## Tone",
    "Be friendly, encouraging, patient, and concise.",
    "",
    `Student Context: Class ${user.classLevel}, ${user.board} board, goal ${GOAL_LABELS[user.goal] ?? user.goal}.`
  ];
  if (topic) lines.push(`Active context (reference only, do not restrict your scope): Topic: ${topic.name}. Key points: ${topic.keyPoints.join("; ")}. Formulae: ${topic.formulae.join("; ")}.`);
  if (problem) lines.push(`Active problem context: ${problem.statement} (Level ${problem.level}, concept: ${problem.concept}).`);
  if (mistakes.length) {
    lines.push(`Recent mistake patterns: ${mistakes.map((mistake) => MISTAKE_LABELS[mistake.type]).join(", ")}. Address these gently when relevant.`);
  }
  if (learningMode) {
    lines.push(
      `LEARNING MODE IS ACTIVE. Guidance turns so far: ${guidanceTurns}.`,
      guidanceTurns < REVEAL_AFTER_TURNS
        ? "Help the student think through the problem step by step rather than immediately revealing the final answer. Ask what they already understand and give a hint for the next step."
        : "Sufficient guidance has been given. You may now walk through the full step-by-step solution."
    );
  }
  return lines.join("\n");
}

function buildUserPrompt(mode: AiMode, message: string, attemptAnswer: string, attemptSteps: string): string {
  const prompts: Record<AiMode, string> = {
    hint: "Give one hint for the next step only.",
    identify_concept: "Name the concept and formula this problem needs and why.",
    guide: "Guide me through the solution plan without solving it fully.",
    check_approach: `Check this approach and say what is right and what is missing: ${attemptSteps}`,
    find_mistake: `My answer was "${attemptAnswer}" with steps: ${attemptSteps}. Find the mistake and classify it (concept, formula, calculation, unit, sign, misread, reasoning).`,
    full_explanation: "Give the complete step-by-step explanation.",
    explain: "Explain this concept clearly with one example.",
    solve_with_me: "Solve this with me one step at a time. Start with the first step and wait.",
    generate_questions: "Generate 3 practice questions of increasing difficulty with answers hidden at the end.",
    check_answer: `Check my answer "${attemptAnswer}" and explain briefly.`,
    revision: "Give a compact revision sheet: concept, formulae, common mistakes, one quick question.",
    exam: "Act as an examiner: ask one exam-style question, then evaluate my reply strictly."
  };
  return message ? `${prompts[mode]}\n\nStudent says: ${message}` : prompts[mode];
}

/**
 * Single AI entry point. Keys stay in a Functions secret, usage is capped per day,
 * output is validated, and a content-authored fallback answers when the model is unavailable.
 */
export const askAi = onCall({ secrets: [geminiApiKey], timeoutSeconds: 60 }, async (request) => {
  const uid = requireUid(request);
  const data = (request.data ?? {}) as AskAiInput;
  const sessionId = requireString(data.sessionId, "sessionId", 80);
  const mode = requireString(data.mode, "mode", 30) as AiMode;
  if (!MODES.has(mode)) throw new HttpsError("invalid-argument", "Unknown mode.");
  const message = typeof data.message === "string" ? data.message.slice(0, 1500).trim() : "";
  const learningMode = data.learningMode === true;
  const problemId = typeof data.problemId === "string" ? data.problemId.slice(0, 120) : null;
  const topicId = typeof data.topicId === "string" ? data.topicId.slice(0, 120) : null;
  const attemptAnswer = typeof data.attemptAnswer === "string" ? data.attemptAnswer.slice(0, 200) : "";
  const attemptSteps = typeof data.attemptSteps === "string" ? data.attemptSteps.slice(0, 1500) : "";
  const config = await loadConfig();
  const today = istDate(new Date());

  const usageRef = db.doc(`aiUsage/${uid}_${today}`);
  const remaining = await db.runTransaction(async (txn) => {
    const snap = await txn.get(usageRef);
    const count = (snap.get("count") as number | undefined) ?? 0;
    if (count >= config.aiDailyLimit) {
      throw new HttpsError("resource-exhausted", `Daily AI limit of ${config.aiDailyLimit} reached. It resets at midnight IST.`);
    }
    txn.set(usageRef, { uid, date: today, count: count + 1, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    return config.aiDailyLimit - count - 1;
  });

  const [userSnap, topicSnap, problemSnap, solutionSnap, mistakesSnap, turnsSnap] = await Promise.all([
    db.doc(`users/${uid}`).get(),
    topicId ? db.doc(`topics/${topicId}`).get() : Promise.resolve(null),
    problemId ? db.doc(`problems/${problemId}`).get() : Promise.resolve(null),
    problemId ? db.doc(`problemSolutions/${problemId}`).get() : Promise.resolve(null),
    db.collection("mistakes").where("userId", "==", uid).orderBy("createdAt", "desc").limit(5).get(),
    db.collection(`aiSessions/${uid}/messages`).where("sessionId", "==", sessionId).where("role", "==", "assistant").get()
  ]);
  if (!userSnap.exists) throw new HttpsError("failed-precondition", "Profile not found.");
  const user = userSnap.data() as UserDoc;
  const problem = problemSnap?.exists ? (problemSnap.data() as ProblemDoc) : null;
  const solution = solutionSnap?.exists ? (solutionSnap.data() as ProblemSolutionDoc) : null;
  const topic = topicSnap?.exists ? (topicSnap.data() as TopicDoc) : null;
  const mistakes = mistakesSnap.docs.map((doc) => doc.data() as MistakeDoc);
  const guidanceTurns = turnsSnap.docs.filter((doc) => GUIDANCE_MODES.has(doc.get("mode") as AiMode)).length;

  let text: string | null = null;
  let source: "gemini" | "fallback" = "fallback";
  let notice: string | null = null;
  const apiKey = geminiApiKey.value();
  if (apiKey) {
    const client = new GoogleGenAI({ apiKey });
    for (const modelName of CANDIDATE_MODELS) {
      try {
        const response = await withTimeout(
          client.models.generateContent({
            model: modelName,
            contents: buildUserPrompt(mode, message, attemptAnswer, attemptSteps),
            config: {
              systemInstruction: buildSystemPrompt(user, topic, problem, mistakes, learningMode, guidanceTurns),
              maxOutputTokens: 2048,
              temperature: 0.5
            }
          }),
          TIMEOUT_MS
        );
        const validated = validateAiText(response.text);
        if (!validated.ok) {
          logger.warn("AI response rejected", { uid, mode, reason: validated.reason });
          continue;
        } else if (learningMode && solution && guidanceTurns < REVEAL_AFTER_TURNS && leaksFinalAnswer(validated.text, solution.acceptedAnswers)) {
          logger.warn("AI response leaked the answer in learning mode", { uid, mode });
          continue;
        } else {
          text = validated.text;
          source = "gemini";
          break;
        }
      } catch (error) {
        logger.error("Gemini call failed for model", { model: modelName, uid, mode, message: error instanceof Error ? error.message : String(error) });
      }
    }
  }
  if (!text) {
    text = fallbackResponse({ mode, solution, topic, problemTitle: problem?.title ?? null, learningMode, guidanceTurns });
    notice = apiKey ? FALLBACK_NOTICE : "AI service not configured. Showing guided fallback.";
    if (!text) {
      throw new HttpsError("unavailable", `${notice} No guided content exists for this request yet.`);
    }
  }

  const messages = db.collection(`aiSessions/${uid}/messages`);
  const batch = db.batch();
  const userMessageRef = messages.doc();
  const assistantRef = messages.doc();
  batch.set(userMessageRef, { id: userMessageRef.id, sessionId, role: "user", mode, text: message || mode, source: null, createdAt: FieldValue.serverTimestamp() });
  batch.set(assistantRef, { id: assistantRef.id, sessionId, role: "assistant", mode, text, source, createdAt: FieldValue.serverTimestamp() });
  await batch.commit();

  return { text, source, notice, remaining, guidanceTurns: guidanceTurns + (GUIDANCE_MODES.has(mode) ? 1 : 0) };
});
