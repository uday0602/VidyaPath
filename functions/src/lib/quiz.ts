import type { QuestionKeyDoc } from "../types.js";

export interface QuizScore {
  score: number;
  total: number;
  results: Record<string, { correctIndex: number; explanation: string; correct: boolean }>;
}

/** Score submitted answers against server-only keys. Unanswered questions count as wrong. */
export function scoreQuiz(questionIds: string[], answers: Record<string, number>, keys: Map<string, QuestionKeyDoc>): QuizScore {
  const results: QuizScore["results"] = {};
  let score = 0;
  for (const questionId of questionIds) {
    const key = keys.get(questionId);
    if (!key) continue;
    const correct = answers[questionId] === key.correctIndex;
    if (correct) score += 1;
    results[questionId] = { correctIndex: key.correctIndex, explanation: key.explanation, correct };
  }
  return { score, total: questionIds.length, results };
}
