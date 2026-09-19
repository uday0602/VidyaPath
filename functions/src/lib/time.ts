const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

/** Calendar date in Asia/Kolkata as YYYY-MM-DD. Server time only, never the client clock. */
export function istDate(now: Date): string {
  return new Date(now.getTime() + IST_OFFSET_MS).toISOString().slice(0, 10);
}

/** Whole days between two YYYY-MM-DD strings (b - a). */
export function daysBetween(a: string, b: string): number {
  const msA = Date.parse(`${a}T00:00:00Z`);
  const msB = Date.parse(`${b}T00:00:00Z`);
  return Math.round((msB - msA) / 86_400_000);
}
