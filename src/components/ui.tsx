import { useEffect, type ReactNode } from "react";
import { Link } from "react-router-dom";

export function Spinner({ label = "Loading..." }: { label?: string }) {
  return (
    <div className="flex items-center gap-3 text-sm text-ink-500" role="status" aria-live="polite">
      <span className="h-4 w-4 animate-spin rounded-full border-2 border-brand-500 border-t-transparent" aria-hidden="true" />
      {label}
    </div>
  );
}

/** Uniform loading / error / empty handling. Every Firebase-backed page goes through this. */
export function AsyncState({
  loading,
  error,
  empty,
  loadingLabel = "Loading your learning journey...",
  emptyTitle = "Nothing here yet",
  emptyBody,
  onRetry,
  children
}: {
  loading: boolean;
  error: string | null;
  empty?: boolean;
  loadingLabel?: string;
  emptyTitle?: string;
  emptyBody?: ReactNode;
  onRetry?: () => void;
  children: ReactNode;
}) {
  if (loading) return <div className="card"><Spinner label={loadingLabel} /></div>;
  if (error) {
    return (
      <div className="card border-danger-500/30 bg-red-50" role="alert">
        <p className="font-semibold text-danger-500">Something went wrong.</p>
        <p className="mt-1 text-sm text-ink-700">{error}</p>
        {onRetry && <button type="button" className="btn-secondary mt-3" onClick={onRetry}>Try again</button>}
      </div>
    );
  }
  if (empty) return <EmptyState title={emptyTitle} body={emptyBody} />;
  return <>{children}</>;
}

export function EmptyState({ title, body, action }: { title: string; body?: ReactNode; action?: ReactNode }) {
  return (
    <div className="card border-dashed text-center">
      <p className="font-semibold text-ink-900">{title}</p>
      {body && <p className="mt-1 text-sm text-ink-500">{body}</p>}
      {action && <div className="mt-3">{action}</div>}
    </div>
  );
}

export function PageHeader({ title, subtitle, action }: { title: string; subtitle?: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-2xl font-bold text-ink-900">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-ink-500">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

export function StatTile({ label, value, hint, to }: { label: string; value: ReactNode; hint?: string; to?: string }) {
  const body = (
    <>
      <p className="text-xs font-medium uppercase tracking-wide text-ink-500">{label}</p>
      <p className="mt-1 text-2xl font-bold text-ink-900">{value}</p>
      {hint && <p className="mt-1 text-xs text-ink-500">{hint}</p>}
    </>
  );
  return to ? <Link to={to} className="card block hover:border-brand-500">{body}</Link> : <div className="card">{body}</div>;
}

export function ProgressBar({ value, label, tone = "brand" }: { value: number; label?: string; tone?: "brand" | "success" | "warn" }) {
  const clamped = Math.max(0, Math.min(100, value));
  const color = tone === "success" ? "bg-success-500" : tone === "warn" ? "bg-warn-500" : "bg-brand-500";
  return (
    <div>
      {label && (
        <div className="mb-1 flex justify-between text-xs text-ink-500">
          <span>{label}</span>
          <span>{Math.round(clamped)}%</span>
        </div>
      )}
      <div className="h-2 w-full overflow-hidden rounded-full bg-ink-200" role="progressbar" aria-valuenow={Math.round(clamped)} aria-valuemin={0} aria-valuemax={100} aria-label={label ?? "progress"}>
        <div className={`h-full ${color} transition-all`} style={{ width: `${clamped}%` }} />
      </div>
    </div>
  );
}

export function PrototypeTag({ label = "Prototype" }: { label?: string }) {
  return <span className="tag bg-warn-500/15 text-warn-500" title="Demonstration-only feature. Not production-ready.">{label}</span>;
}

export function SampleTag() {
  return <span className="tag bg-ink-200 text-ink-700">Sample Content</span>;
}

export function AiLabel({ source }: { source: "gemini" | "fallback" | null }) {
  if (source === "fallback") return <span className="tag bg-warn-500/15 text-warn-500">Guided fallback (AI unavailable)</span>;
  return <span className="tag bg-brand-100 text-brand-700">AI-generated explanation</span>;
}

export function Tag({ children, tone = "neutral" }: { children: ReactNode; tone?: "neutral" | "brand" | "success" | "warn" | "danger" }) {
  const tones = {
    neutral: "bg-ink-200 text-ink-700",
    brand: "bg-brand-100 text-brand-700",
    success: "bg-success-500/15 text-success-500",
    warn: "bg-warn-500/15 text-warn-500",
    danger: "bg-danger-500/15 text-danger-500"
  };
  return <span className={`tag ${tones[tone]}`}>{children}</span>;
}

export function Modal({ open, title, onClose, children }: { open: boolean; title: string; onClose: () => void; children: ReactNode }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink-900/50 p-4" onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-label={title} className="card w-full max-w-lg" onClick={(event) => event.stopPropagation()}>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-semibold">{title}</h2>
          <button type="button" className="btn-ghost" onClick={onClose} aria-label="Close dialog">✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function InlineError({ message }: { message: string | null }) {
  if (!message) return null;
  return <p className="mt-2 text-sm text-danger-500" role="alert">{message}</p>;
}

export function RewardToast({ result, onDone }: { result: { xp: number; stars: number; streak?: { current: number; incremented: boolean }; badges?: string[] } | null; onDone: () => void }) {
  useEffect(() => {
    if (!result) return;
    const timer = setTimeout(onDone, 5000);
    return () => clearTimeout(timer);
  }, [result, onDone]);
  if (!result) return null;
  const parts = [];
  if (result.xp > 0) parts.push(`+${result.xp} XP`);
  if (result.stars > 0) parts.push(`+${result.stars} Stars`);
  if (result.stars < 0) parts.push(`${result.stars} Stars`);
  if (result.streak?.incremented) parts.push(`Streak ${result.streak.current} days`);
  if (result.badges?.length) parts.push(`Badge: ${result.badges.join(", ")}`);
  if (parts.length === 0) return null;
  return (
    <div className="fixed bottom-4 right-4 z-40 rounded-xl bg-ink-900 px-4 py-3 text-sm font-semibold text-white shadow-lg" role="status" aria-live="polite">
      {parts.join(" · ")}
    </div>
  );
}
