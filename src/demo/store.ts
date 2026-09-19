// In-browser document store that stands in for Firestore when the app is built with --mode demo.
// Content collections come from seed/content and are read-only; everything else is kept in
// memory and mirrored to localStorage so a demo session survives a reload.

export type DocData = Record<string, unknown>;

export class Timestamp {
  constructor(public readonly seconds: number, public readonly nanoseconds: number) {}
  static now(): Timestamp {
    return Timestamp.fromMillis(Date.now());
  }
  static fromDate(date: Date): Timestamp {
    return Timestamp.fromMillis(date.getTime());
  }
  static fromMillis(millis: number): Timestamp {
    return new Timestamp(Math.floor(millis / 1000), (millis % 1000) * 1_000_000);
  }
  toMillis(): number {
    return this.seconds * 1000 + Math.floor(this.nanoseconds / 1_000_000);
  }
  toDate(): Date {
    return new Date(this.toMillis());
  }
  toJSON(): { __timestamp: number } {
    return { __timestamp: this.toMillis() };
  }
}

const SERVER_TIMESTAMP = { __sentinel: "serverTimestamp" } as const;
export function serverTimestamp(): unknown {
  return SERVER_TIMESTAMP;
}

export class DemoError extends Error {
  constructor(public readonly code: string, message: string) {
    super(message);
    this.name = "DemoError";
  }
}

const STORAGE_KEY = "vidyapath.demo.store";
const STORAGE_VERSION = 1;

const contentDocs = new Map<string, DocData>();
const userDocs = new Map<string, DocData>();
const listeners = new Set<() => void>();
const writeHooks: ((path: string) => void)[] = [];
let notifyScheduled = false;
let persistScheduled = false;

function collectionOf(path: string): string {
  return path.slice(0, path.lastIndexOf("/"));
}

export function idOf(path: string): string {
  return path.slice(path.lastIndexOf("/") + 1);
}

export function newDocId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID().replace(/-/g, "").slice(0, 20) : `${Date.now()}${Math.random().toString(36).slice(2, 10)}`;
}

function resolveSentinels(data: DocData): DocData {
  const resolved: DocData = {};
  for (const [key, value] of Object.entries(data)) {
    resolved[key] = value === SERVER_TIMESTAMP ? Timestamp.now() : value;
  }
  return resolved;
}

function reviveTimestamps(_key: string, value: unknown): unknown {
  if (typeof value === "object" && value !== null && "__timestamp" in value && typeof (value as { __timestamp: unknown }).__timestamp === "number") {
    return Timestamp.fromMillis((value as { __timestamp: number }).__timestamp);
  }
  return value;
}

function storage(): Storage | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch (error) {
    console.warn("localStorage unavailable, demo data will not persist", error);
    return null;
  }
}

function persist(): void {
  const target = storage();
  if (!target) return;
  try {
    target.setItem(STORAGE_KEY, JSON.stringify({ version: STORAGE_VERSION, docs: [...userDocs.entries()] }));
  } catch (error) {
    console.error("Could not persist demo data", error);
  }
}

function loadPersisted(): boolean {
  const target = storage();
  if (!target) return false;
  try {
    const raw = target.getItem(STORAGE_KEY);
    if (!raw) return false;
    const parsed = JSON.parse(raw, reviveTimestamps) as { version: number; docs: [string, DocData][] };
    if (parsed.version !== STORAGE_VERSION) return false;
    for (const [path, data] of parsed.docs) userDocs.set(path, data);
    return true;
  } catch (error) {
    console.error("Could not read persisted demo data, starting fresh", error);
    return false;
  }
}

function scheduleNotify(): void {
  if (notifyScheduled) return;
  notifyScheduled = true;
  queueMicrotask(() => {
    notifyScheduled = false;
    for (const listener of listeners) listener();
  });
  if (!persistScheduled) {
    persistScheduled = true;
    setTimeout(() => {
      persistScheduled = false;
      persist();
    }, 50);
  }
}

/** Seed the store. Content is always loaded; user data only when nothing was persisted. */
export function initStore(content: Map<string, DocData>, seedUserDocs: () => Map<string, DocData>): void {
  contentDocs.clear();
  for (const [path, data] of content) contentDocs.set(path, data);
  if (!loadPersisted()) {
    userDocs.clear();
    for (const [path, data] of seedUserDocs()) userDocs.set(path, data);
  }
}

/** Test helper: drop all user data and reseed. */
export function resetStore(seedUserDocs: () => Map<string, DocData>): void {
  userDocs.clear();
  for (const [path, data] of seedUserDocs()) userDocs.set(path, data);
  scheduleNotify();
}

export function readDoc(path: string): DocData | null {
  return userDocs.get(path) ?? contentDocs.get(path) ?? null;
}

export function writeDoc(path: string, data: DocData, merge = false): void {
  const previous = merge ? readDoc(path) : null;
  const merged = { ...(previous ?? {}), ...resolveSentinels(data) };
  userDocs.set(path, merged);
  for (const hook of writeHooks) hook(path);
  scheduleNotify();

  // Automatically sync user profiles to the server database
  if (path.startsWith("users/") && typeof window !== "undefined" && typeof fetch === "function") {
    try {
      fetch("/api/users/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(merged)
      }).catch(() => {});
    } catch {
      // Ignore background sync errors
    }
  }
}

export function updateDocFields(path: string, patch: DocData): void {
  if (!readDoc(path)) throw new DemoError("not-found", `No document at ${path}`);
  writeDoc(path, patch, true);
}

export function removeDoc(path: string): void {
  userDocs.delete(path);
  scheduleNotify();
}

export function listDocs(collectionPath: string): { id: string; data: DocData }[] {
  const byId = new Map<string, DocData>();
  for (const source of [contentDocs, userDocs]) {
    for (const [path, data] of source) {
      if (collectionOf(path) === collectionPath) byId.set(idOf(path), data);
    }
  }
  return [...byId.entries()].map(([id, data]) => ({ id, data }));
}

export function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Runs after every write, used to mirror the users/{uid} -> publicProfiles trigger. */
export function onWrite(hook: (path: string) => void): void {
  writeHooks.push(hook);
}

// ---------- query evaluation ----------
export const DOCUMENT_ID_FIELD = "__name__";

export interface Filter {
  field: string;
  op: string;
  value: unknown;
}
export interface Order {
  field: string;
  direction: "asc" | "desc";
}
export interface QuerySpec {
  path: string;
  filters: Filter[];
  orders: Order[];
  max: number | null;
}

function fieldValue(id: string, data: DocData, field: string): unknown {
  if (field === DOCUMENT_ID_FIELD) return id;
  return field.split(".").reduce<unknown>((current, segment) => (typeof current === "object" && current !== null ? (current as DocData)[segment] : undefined), data);
}

function rank(value: unknown): number | string {
  if (value instanceof Timestamp) return value.toMillis();
  if (value instanceof Date) return value.getTime();
  if (typeof value === "number" || typeof value === "string") return value;
  if (typeof value === "boolean") return value ? 1 : 0;
  return "";
}

function compare(left: unknown, right: unknown): number {
  const leftRank = rank(left);
  const rightRank = rank(right);
  if (leftRank < rightRank) return -1;
  if (leftRank > rightRank) return 1;
  return 0;
}

function matches(id: string, data: DocData, filter: Filter): boolean {
  const actual = fieldValue(id, data, filter.field);
  switch (filter.op) {
    case "==":
      return actual === filter.value;
    case "!=":
      return actual !== filter.value;
    case "in":
      return Array.isArray(filter.value) && filter.value.includes(actual);
    case "array-contains":
      return Array.isArray(actual) && actual.includes(filter.value);
    case "<":
      return compare(actual, filter.value) < 0;
    case "<=":
      return compare(actual, filter.value) <= 0;
    case ">":
      return compare(actual, filter.value) > 0;
    case ">=":
      return compare(actual, filter.value) >= 0;
    default:
      throw new DemoError("invalid-argument", `Unsupported query operator ${filter.op}`);
  }
}

export function runQuery(spec: QuerySpec): { id: string; data: DocData }[] {
  let rows = listDocs(spec.path).filter((row) => spec.filters.every((filter) => matches(row.id, row.data, filter)));
  // Firestore drops documents that lack an orderBy field.
  for (const order of spec.orders) rows = rows.filter((row) => fieldValue(row.id, row.data, order.field) !== undefined);
  if (spec.orders.length) {
    rows.sort((left, right) => {
      for (const order of spec.orders) {
        const result = compare(fieldValue(left.id, left.data, order.field), fieldValue(right.id, right.data, order.field));
        if (result !== 0) return order.direction === "desc" ? -result : result;
      }
      return 0;
    });
  }
  return spec.max === null ? rows : rows.slice(0, spec.max);
}
