import { useCallback, useEffect, useRef, useState } from "react";
import { doc, getDoc, getDocs, onSnapshot, type DocumentReference, type Query } from "firebase/firestore";
import { db } from "../lib/firebase";
import { errorMessage } from "../lib/callables";

export interface AsyncData<T> {
  data: T;
  loading: boolean;
  error: string | null;
  reload: () => void;
}

/** One-shot document read. `path` null skips the read (data stays null, loading false). */
export function useDoc<T>(path: string | null, deps: unknown[] = []): AsyncData<T | null> {
  const [state, setState] = useState<{ data: T | null; loading: boolean; error: string | null }>({ data: null, loading: Boolean(path), error: null });
  const [version, setVersion] = useState(0);
  useEffect(() => {
    if (!path) {
      setState({ data: null, loading: false, error: null });
      return;
    }
    let cancelled = false;
    setState((previous) => ({ ...previous, loading: true, error: null }));
    getDoc(doc(db, path) as DocumentReference)
      .then((snapshot) => {
        if (!cancelled) setState({ data: snapshot.exists() ? (snapshot.data() as T) : null, loading: false, error: null });
      })
      .catch((error) => {
        console.error(`Read failed for ${path}`, error);
        if (!cancelled) setState({ data: null, loading: false, error: errorMessage(error) });
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path, version, ...deps]);
  return { ...state, reload: () => setVersion((value) => value + 1) };
}

/** One-shot query read. `build` returns null to skip. Memoise inputs via deps. */
export function useQueryOnce<T>(build: () => Query | null, deps: unknown[]): AsyncData<T[]> {
  const [state, setState] = useState<{ data: T[]; loading: boolean; error: string | null }>({ data: [], loading: true, error: null });
  const [version, setVersion] = useState(0);
  const buildRef = useRef(build);
  buildRef.current = build;
  useEffect(() => {
    const query = buildRef.current();
    if (!query) {
      setState({ data: [], loading: false, error: null });
      return;
    }
    let cancelled = false;
    setState((previous) => ({ ...previous, loading: true, error: null }));
    getDocs(query)
      .then((snapshot) => {
        if (!cancelled) setState({ data: snapshot.docs.map((item) => ({ id: item.id, ...item.data() }) as T), loading: false, error: null });
      })
      .catch((error) => {
        console.error("Query failed", error);
        if (!cancelled) setState({ data: [], loading: false, error: errorMessage(error) });
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [version, ...deps]);
  return { ...state, reload: () => setVersion((value) => value + 1) };
}

/** Live query. Use sparingly: doubts detail, notifications, rewards balance already lives in AuthContext. */
export function useLiveQuery<T>(build: () => Query | null, deps: unknown[]): AsyncData<T[]> {
  const [state, setState] = useState<{ data: T[]; loading: boolean; error: string | null }>({ data: [], loading: true, error: null });
  const buildRef = useRef(build);
  buildRef.current = build;
  useEffect(() => {
    const query = buildRef.current();
    if (!query) {
      setState({ data: [], loading: false, error: null });
      return;
    }
    setState((previous) => ({ ...previous, loading: true, error: null }));
    return onSnapshot(
      query,
      (snapshot) => setState({ data: snapshot.docs.map((item) => ({ id: item.id, ...item.data() }) as T), loading: false, error: null }),
      (error) => {
        console.error("Live query failed", error);
        setState({ data: [], loading: false, error: errorMessage(error) });
      }
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return { ...state, reload: () => undefined };
}

/** Wrap an async action with busy/error state and duplicate-click protection. */
export function useAction<Args extends unknown[], Result>(action: (...args: Args) => Promise<Result>) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const busyRef = useRef(false);
  const run = useCallback(
    async (...args: Args): Promise<Result | null> => {
      if (busyRef.current) return null;
      busyRef.current = true;
      setBusy(true);
      setError(null);
      try {
        return await action(...args);
      } catch (caught) {
        console.error("Action failed", caught);
        setError(errorMessage(caught));
        return null;
      } finally {
        busyRef.current = false;
        setBusy(false);
      }
    },
    [action]
  );
  return { run, busy, error, clearError: () => setError(null) };
}
