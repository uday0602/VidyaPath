import { useState, type FormEvent } from "react";
import { sendPasswordResetEmail } from "firebase/auth";
import { Link } from "react-router-dom";
import { auth } from "../lib/firebase";
import { InlineError } from "../components/ui";

export default function ResetPasswordPage() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await sendPasswordResetEmail(auth, email.trim());
      setSent(true);
    } catch (caught) {
      console.error("Password reset failed", caught);
      const code = (caught as { code?: string }).code;
      setError(code === "auth/user-not-found" ? "No account exists for this email." : code === "auth/invalid-email" ? "That email address does not look right." : "Could not send the reset email. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-ink-100 p-6">
      <form onSubmit={onSubmit} className="card w-full max-w-md">
        <h1 className="text-2xl font-bold">Reset password</h1>
        {sent ? (
          <div className="mt-4 rounded-lg bg-success-500/10 p-3 text-sm text-success-500" role="status">
            Reset email sent to {email}. Check your inbox and spam folder.
          </div>
        ) : (
          <>
            <p className="mt-1 text-sm text-ink-500">We will email you a link to choose a new password.</p>
            <div className="mt-4">
              <label htmlFor="email" className="label">Email</label>
              <input id="email" type="email" autoComplete="email" required className="input" value={email} onChange={(event) => setEmail(event.target.value)} />
            </div>
            <InlineError message={error} />
            <button type="submit" className="btn-primary mt-4 w-full" disabled={busy}>{busy ? "Sending..." : "Send reset link"}</button>
          </>
        )}
        <Link to="/login" className="btn-ghost mt-4 w-full">Back to login</Link>
      </form>
    </div>
  );
}
