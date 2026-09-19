// firebase/firestore stand-in for --mode demo builds. Only the surface the app uses is implemented.
import "./init";
import {
  DOCUMENT_ID_FIELD, DemoError, idOf, listDocs, readDoc, removeDoc, runQuery, serverTimestamp, subscribe, Timestamp, updateDocFields, writeDoc,
  type DocData, type Filter, type Order, type QuerySpec
} from "./store";

export { serverTimestamp, Timestamp };

export interface DocRef {
  kind: "doc";
  path: string;
  id: string;
}
export interface CollectionRef {
  kind: "collection";
  path: string;
}
export interface QueryRef extends QuerySpec {
  kind: "query";
}
type Constraint = { kind: "where"; filter: Filter } | { kind: "orderBy"; order: Order } | { kind: "limit"; max: number };

export function getFirestore(): object {
  return {};
}
export function connectFirestoreEmulator(): void {}

export function collection(_db: unknown, ...segments: string[]): CollectionRef {
  return { kind: "collection", path: segments.join("/") };
}
export function doc(_db: unknown, ...segments: string[]): DocRef {
  const path = segments.join("/");
  return { kind: "doc", path, id: idOf(path) };
}
export function documentId(): string {
  return DOCUMENT_ID_FIELD;
}
export function where(field: string, op: string, value: unknown): Constraint {
  return { kind: "where", filter: { field, op, value } };
}
export function orderBy(field: string, direction: "asc" | "desc" = "asc"): Constraint {
  return { kind: "orderBy", order: { field, direction } };
}
export function limit(max: number): Constraint {
  return { kind: "limit", max };
}
export function query(source: CollectionRef | QueryRef, ...constraints: Constraint[]): QueryRef {
  const spec: QueryRef = source.kind === "query" ? { ...source, filters: [...source.filters], orders: [...source.orders] } : { kind: "query", path: source.path, filters: [], orders: [], max: null };
  for (const constraint of constraints) {
    if (constraint.kind === "where") spec.filters.push(constraint.filter);
    else if (constraint.kind === "orderBy") spec.orders.push(constraint.order);
    else spec.max = constraint.max;
  }
  return spec;
}

function docSnapshot(ref: DocRef) {
  const data = readDoc(ref.path);
  return {
    id: ref.id,
    ref,
    exists: () => data !== null,
    data: () => (data ? { ...data } : undefined),
    get: (field: string) => data?.[field]
  };
}

function querySnapshot(source: CollectionRef | QueryRef) {
  const rows = source.kind === "query" ? runQuery(source) : listDocs(source.path);
  const docs = rows.map((row) => ({ id: row.id, ref: doc(null, `${source.path}/${row.id}`), exists: () => true, data: () => ({ ...row.data }) }));
  return { docs, empty: docs.length === 0, size: docs.length };
}

export async function getDoc(ref: DocRef) {
  return docSnapshot(ref);
}
export async function getDocs(source: CollectionRef | QueryRef) {
  return querySnapshot(source);
}

export function onSnapshot(target: DocRef | CollectionRef | QueryRef, onNext: (snapshot: never) => void, onError?: (error: Error) => void): () => void {
  const emit = () => {
    try {
      onNext((target.kind === "doc" ? docSnapshot(target) : querySnapshot(target)) as never);
    } catch (error) {
      console.error("Demo snapshot failed", error);
      onError?.(error instanceof Error ? error : new DemoError("internal", String(error)));
    }
  };
  queueMicrotask(emit);
  return subscribe(emit);
}

export async function setDoc(ref: DocRef, data: DocData, options?: { merge?: boolean }): Promise<void> {
  writeDoc(ref.path, data, options?.merge === true);
}
export async function updateDoc(ref: DocRef, patch: DocData): Promise<void> {
  updateDocFields(ref.path, patch);
}
export async function deleteDoc(ref: DocRef): Promise<void> {
  removeDoc(ref.path);
}
