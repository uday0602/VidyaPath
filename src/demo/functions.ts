// firebase/functions stand-in for --mode demo builds. Callables run in the browser against the demo store.
import "./init";
import { currentUid } from "./auth";
import { DemoError } from "./store";
import { callables, installTriggers } from "./callables";

installTriggers();

export function getFunctions(): object {
  return {};
}
export function connectFunctionsEmulator(): void {}

export function httpsCallable<Input, Output>(_functions: unknown, name: string): (input: Input) => Promise<{ data: Output }> {
  return async (input: Input) => {
    const handler = callables[name];
    if (!handler) throw new DemoError("functions/not-found", `Unknown callable ${name}`);
    const uid = currentUid();
    if (!uid) throw new DemoError("functions/unauthenticated", "Please sign in again.");
    try {
      return { data: (await handler(uid, (input ?? {}) as Record<string, unknown>)) as Output };
    } catch (error) {
      if (error instanceof DemoError && !error.code.startsWith("functions/")) throw new DemoError(`functions/${error.code}`, error.message);
      throw error;
    }
  };
}
