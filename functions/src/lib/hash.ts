import { createHash } from "node:crypto";

/** Stable hash of normalised text, used to detect duplicate doubts and answers. */
export function contentHash(text: string): string {
  const normalized = text.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  return createHash("sha1").update(normalized).digest("hex");
}

const ADJECTIVES = ["Quiet", "Bright", "Swift", "Calm", "Keen", "Bold", "Clever", "Steady", "Curious", "Focused"];
const NOUNS = ["Falcon", "Otter", "Comet", "Maple", "Lynx", "Ember", "Orbit", "Pixel", "Harbor", "Summit"];

/** Anonymous, stable display name derived from the uid. Never reveals the real name or email. */
export function anonUsername(uid: string): string {
  const digest = createHash("sha1").update(uid).digest();
  const adjective = ADJECTIVES[digest[0] % ADJECTIVES.length];
  const noun = NOUNS[digest[1] % NOUNS.length];
  const number = (digest[2] % 90) + 10;
  return `${adjective}${noun}${number}`;
}

export function avatarFor(uid: string): string {
  const digest = createHash("sha1").update(uid).digest();
  return `avatar-${(digest[3] % 8) + 1}`;
}
