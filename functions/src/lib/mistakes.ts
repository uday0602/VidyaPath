import type { MistakeType, ProblemSolutionDoc } from "../types.js";

export interface AttemptForClassification {
  finalAnswer: string;
  steps: Record<string, string>;
  timeSpentSec: number;
  expectedMinutes: number;
}

export function normalizeAnswer(raw: string): string {
  return raw.trim().toLowerCase().replace(/\s+/g, " ").replace(/,/g, "");
}

function parseNumeric(raw: string): number | null {
  const match = normalizeAnswer(raw).match(/-?\d+(\.\d+)?(e-?\d+)?/);
  return match ? Number(match[0]) : null;
}

export function isCorrectAnswer(solution: ProblemSolutionDoc, finalAnswer: string): boolean {
  const normalized = normalizeAnswer(finalAnswer);
  if (solution.acceptedAnswers.some((accepted) => normalizeAnswer(accepted) === normalized)) return true;
  if (solution.numericAnswer !== null) {
    const value = parseNumeric(finalAnswer);
    if (value === null) return false;
    const tolerance = Math.max(solution.tolerance, Math.abs(solution.numericAnswer) * 0.005);
    return Math.abs(value - solution.numericAnswer) <= tolerance;
  }
  return false;
}

/**
 * Rule-based classification. Order matters: the most specific signal wins.
 * 1. An answer the content author listed as a known wrong answer.
 * 2. Sign error: magnitude right, sign flipped.
 * 3. Unit error: number right but unit missing or different.
 * 4. Calculation error: student picked the right concept and formula but the number is off.
 * 5. Formula error: concept right, formula wrong.
 * 6. Time: far over the expected time with an empty or trivial answer.
 * 7. Misread: the "given"/"find" step contradicts the problem.
 * 8. Concept error otherwise.
 */
export function classifyMistake(solution: ProblemSolutionDoc, attempt: AttemptForClassification): MistakeType {
  const normalized = normalizeAnswer(attempt.finalAnswer);
  const listed = solution.commonMistakes.find((mistake) =>
    mistake.matchAnswers.some((wrong) => normalizeAnswer(wrong) === normalized)
  );
  if (listed) return listed.type;

  const value = parseNumeric(attempt.finalAnswer);
  const expected = solution.numericAnswer;
  if (value !== null && expected !== null && expected !== 0) {
    if (Math.abs(Math.abs(value) - Math.abs(expected)) <= solution.tolerance && Math.sign(value) !== Math.sign(expected)) {
      return "sign";
    }
    if (Math.abs(value - expected) <= solution.tolerance) {
      return "unit";
    }
  }

  const conceptStep = (attempt.steps.concept ?? "").toLowerCase();
  const formulaStep = (attempt.steps.formula ?? attempt.steps.method ?? "").toLowerCase();
  const conceptMatches = conceptStep.length > 0 && solutionMentions(solution, conceptStep, "concept");
  const formulaMatches = formulaStep.length > 0 && solutionMentions(solution, formulaStep, "formula");

  if (conceptMatches && formulaMatches) return "calculation";
  if (conceptMatches && formulaStep.length > 0) return "formula";

  const overTime = attempt.timeSpentSec > attempt.expectedMinutes * 60 * 2;
  if (overTime && normalized.length <= 1) return "time";

  const givenStep = (attempt.steps.given ?? "").toLowerCase();
  if (givenStep.length > 0 && !solutionMentions(solution, givenStep, "given")) return "misread";

  return "concept";
}

function solutionMentions(solution: ProblemSolutionDoc, studentText: string, stepLabel: string): boolean {
  const reference = solution.steps
    .filter((step) => step.label.toLowerCase().includes(stepLabel))
    .map((step) => step.content.toLowerCase())
    .join(" ");
  if (!reference) return false;
  const condensed = studentText.replace(/\s+/g, "");
  if (condensed.length >= 3 && reference.replace(/\s+/g, "").includes(condensed)) return true;
  const tokens = studentText.split(/[^a-z0-9]+/).filter((token) => token.length >= 3);
  if (tokens.length === 0) return false;
  const hits = tokens.filter((token) => reference.includes(token)).length;
  return hits / tokens.length >= 0.5;
}
