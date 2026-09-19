import type { SpinOutcome } from "../types.js";

export function canSpin(nextSpinAtMs: number | null, nowMs: number): boolean {
  return nextSpinAtMs === null || nowMs >= nextSpinAtMs;
}

/** Weighted pick. `random` is injected so tests are deterministic. */
export function pickOutcome(outcomes: SpinOutcome[], random: number): SpinOutcome {
  const totalWeight = outcomes.reduce((sum, outcome) => sum + outcome.weight, 0);
  let cursor = random * totalWeight;
  for (const outcome of outcomes) {
    cursor -= outcome.weight;
    if (cursor < 0) return outcome;
  }
  return outcomes[outcomes.length - 1];
}
