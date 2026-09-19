// firebase/auth stand-in for --mode demo builds. Accounts live in the demo store; the signed-in uid is kept in localStorage.
import "./init";
import { DemoError, listDocs, newDocId, readDoc, writeDoc } from "./store";

export interface DemoUser {
  uid: string;
  email: string;
  displayName: string;
  emailVerified: boolean;
  getIdTokenResult: () => Promise<{ claims: Record<string, unknown> }>;
}
interface AccountDoc {
  uid: string;
  email: string;
  password: string;
  displayName: string;
  admin: boolean;
}

const SESSION_KEY = "vidyapath.demo.uid";
const listeners = new Set<(user: DemoUser | null) => void>();
let currentUser: DemoUser | null = null;

function toUser(account: AccountDoc): DemoUser {
  return { uid: account.uid, email: account.email, displayName: account.displayName, emailVerified: true, getIdTokenResult: async () => ({ claims: account.admin ? { admin: true } : {} }) };
}

function accountByEmail(email: string): AccountDoc | null {
  const wanted = email.trim().toLowerCase();
  return (listDocs("demoAccounts").map((row) => row.data as unknown as AccountDoc).find((account) => account.email.toLowerCase() === wanted)) ?? null;
}

function rememberUid(uid: string | null): void {
  try {
    if (typeof localStorage === "undefined") return;
    if (uid) localStorage.setItem(SESSION_KEY, uid);
    else localStorage.removeItem(SESSION_KEY);
  } catch (error) {
    console.warn("Could not remember demo session", error);
  }
}

function setCurrent(user: DemoUser | null): void {
  currentUser = user;
  rememberUid(user?.uid ?? null);
  for (const listener of listeners) listener(user);
}

function restoreSession(): void {
  try {
    const uid = typeof localStorage === "undefined" ? null : localStorage.getItem(SESSION_KEY);
    const account = uid ? (readDoc(`demoAccounts/${uid}`) as AccountDoc | null) : null;
    currentUser = account ? toUser(account) : null;
  } catch (error) {
    console.warn("Could not restore demo session", error);
  }
}
restoreSession();

export function currentUid(): string | null {
  return currentUser?.uid ?? null;
}

export function getAuth(): object {
  return {};
}
export function connectAuthEmulator(): void {}

export function onAuthStateChanged(_auth: unknown, listener: (user: DemoUser | null) => void): () => void {
  listeners.add(listener);
  queueMicrotask(() => listener(currentUser));
  return () => listeners.delete(listener);
}

export async function signInWithEmailAndPassword(_auth: unknown, email: string, password: string): Promise<{ user: DemoUser }> {
  const account = accountByEmail(email);
  if (!account) throw new DemoError("auth/user-not-found", "No account exists for this email.");
  if (account.password !== password) throw new DemoError("auth/invalid-credential", "Wrong email or password.");
  const user = toUser(account);
  setCurrent(user);
  return { user };
}

export async function createUserWithEmailAndPassword(_auth: unknown, email: string, password: string): Promise<{ user: DemoUser }> {
  if (!email.includes("@")) throw new DemoError("auth/invalid-email", "That email address does not look right.");
  if (password.length < 6) throw new DemoError("auth/weak-password", "Choose a stronger password.");
  if (accountByEmail(email)) throw new DemoError("auth/email-already-in-use", "An account with this email already exists.");
  const account: AccountDoc = { uid: `demo_${newDocId()}`, email: email.trim(), password, displayName: "", admin: false };
  writeDoc(`demoAccounts/${account.uid}`, { ...account });
  const user = toUser(account);
  setCurrent(user);
  return { user };
}

export async function signOut(): Promise<void> {
  setCurrent(null);
}

export async function sendPasswordResetEmail(_auth: unknown, email: string): Promise<void> {
  if (!accountByEmail(email)) throw new DemoError("auth/user-not-found", "No account exists for this email.");
}
