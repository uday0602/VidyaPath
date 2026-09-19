// Browser-side stand-ins for functions/src/lib/hash.ts, which needs node:crypto.

function fnv1a(text: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash;
}

const ADJECTIVES = ["Quiet", "Bright", "Swift", "Calm", "Keen", "Bold", "Clever", "Steady", "Curious", "Focused"];
const NOUNS = ["Falcon", "Otter", "Comet", "Maple", "Lynx", "Ember", "Orbit", "Pixel", "Harbor", "Summit"];

export function anonUsername(uid: string): string {
  const digest = fnv1a(uid);
  return `${ADJECTIVES[digest % ADJECTIVES.length]}${NOUNS[(digest >>> 8) % NOUNS.length]}${((digest >>> 16) % 90) + 10}`;
}

export function avatarFor(uid: string): string {
  return `avatar-${((fnv1a(uid) >>> 24) % 8) + 1}`;
}

export function contentHash(text: string): string {
  return fnv1a(text.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim()).toString(16);
}
