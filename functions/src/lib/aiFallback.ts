import type { AiMode, ProblemSolutionDoc, TopicDoc } from "../types.js";
import { generateEduQuestFallback } from "./eduquestPrompt.js";

export interface FallbackContext {
  mode: AiMode;
  solution: ProblemSolutionDoc | null;
  topic: TopicDoc | null;
  problemTitle: string | null;
  learningMode: boolean;
  guidanceTurns: number;
  message?: string;
}

export const FALLBACK_NOTICE = "AI service temporarily unavailable. Showing guided fallback.";
const REVEAL_AFTER_TURNS = 3;

/**
 * Deterministic, content-authored guidance used when Gemini is not configured or fails.
 * It uses seeded problem solutions / topics when available, and falls back to EduQuest Universal
 * tutor knowledge for all other inquiries so students are never turned away.
 */
export function fallbackResponse(ctx: FallbackContext): string | null {
  const { mode, solution, topic } = ctx;
  if (solution) {
    switch (mode) {
      case "hint":
        return solution.coach.hint;
      case "identify_concept":
        return solution.coach.concept;
      case "guide":
      case "solve_with_me":
        return solution.coach.guide;
      case "check_approach":
      case "check_answer":
        return solution.coach.checkApproach;
      case "find_mistake":
        return solution.coach.findMistake;
      case "full_explanation":
        if (ctx.learningMode && ctx.guidanceTurns < REVEAL_AFTER_TURNS) {
          return `Learning Mode is on, so let's earn the answer first. ${solution.coach.hint} Try the next step and ask again.`;
        }
        return solution.coach.fullExplanation;
      default:
        break;
    }
  }
  if (topic) {
    switch (mode) {
      case "explain":
      case "revision":
        return [
          topic.concept,
          topic.keyPoints.length ? `Key points:\n- ${topic.keyPoints.join("\n- ")}` : "",
          topic.formulae.length ? `Formulae:\n- ${topic.formulae.join("\n- ")}` : ""
        ]
          .filter(Boolean)
          .join("\n\n");
      case "generate_questions":
        return topic.examples.length
          ? `Practice these:\n${topic.examples.map((example, index) => `${index + 1}. ${example.problem}`).join("\n")}`
          : null;
      case "exam":
        return topic.commonMistakes.length
          ? `Exam checklist for ${topic.name}:\n- ${topic.commonMistakes.join("\n- ")}`
          : null;
      case "hint":
        return topic.examples[0] ? `Start from this worked example: ${topic.examples[0].problem}` : null;
      default:
        break;
    }
  }

  // Universal EduQuest fallback for general and off-topic student questions when a message is provided
  if (ctx.message && ctx.message.trim()) {
    return generateEduQuestFallback({
      message: ctx.message,
      mode: ctx.mode,
      topicName: topic?.name ?? null,
      problemTitle: ctx.problemTitle ?? null
    });
  }

  return null;
}
