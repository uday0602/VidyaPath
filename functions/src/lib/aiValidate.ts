const MAX_CHARS = 4000;
const MIN_CHARS = 8;

const BLOCKED_PATTERNS = [/\bapi[_ -]?key\b/i, /\bsk-[a-z0-9]{10,}/i, /<script/i, /javascript:/i];

export interface ValidationResult {
  ok: boolean;
  text: string;
  reason: "empty" | "too_short" | "unsafe" | null;
}

/** Trim, cap length, and reject empty or unsafe model output before it reaches a student. */
export function validateAiText(raw: unknown): ValidationResult {
  if (typeof raw !== "string") return { ok: false, text: "", reason: "empty" };
  let text = raw.replace(/\r/g, "").trim();
  if (text.length === 0) return { ok: false, text: "", reason: "empty" };
  if (text.length < MIN_CHARS) return { ok: false, text, reason: "too_short" };
  if (BLOCKED_PATTERNS.some((pattern) => pattern.test(text))) return { ok: false, text: "", reason: "unsafe" };
  if (text.length > MAX_CHARS) {
    const cut = text.lastIndexOf("\n", MAX_CHARS);
    text = `${text.slice(0, cut > MAX_CHARS / 2 ? cut : MAX_CHARS).trimEnd()}\n\n[Response shortened]`;
  }
  return { ok: true, text, reason: null };
}

/** In Learning Mode the model must not hand over the final answer in the first turns. */
export function leaksFinalAnswer(text: string, acceptedAnswers: string[]): boolean {
  const lowered = text.toLowerCase();
  return acceptedAnswers.some((answer) => {
    const needle = answer.trim().toLowerCase();
    return needle.length > 0 && lowered.includes(needle);
  });
}
