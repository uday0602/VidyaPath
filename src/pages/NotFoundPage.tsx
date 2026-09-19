import { Link } from "react-router-dom";

export default function NotFoundPage() {
  return (
    <div className="flex min-h-screen items-center justify-center p-6">
      <div className="card max-w-md text-center">
        <p className="text-5xl font-bold text-brand-600">404</p>
        <p className="mt-2 font-semibold">This page does not exist.</p>
        <p className="mt-1 text-sm text-ink-500">The link may be old or mistyped.</p>
        <Link to="/dashboard" className="btn-primary mt-4">Go to dashboard</Link>
      </div>
    </div>
  );
}
