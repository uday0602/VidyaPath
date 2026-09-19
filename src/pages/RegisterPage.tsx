import { useState, type FormEvent } from "react";
import { createUserWithEmailAndPassword } from "firebase/auth";
import { doc, serverTimestamp, setDoc } from "firebase/firestore";
import { Link, Navigate, useLocation, useNavigate } from "react-router-dom";
import { auth, db } from "../lib/firebase";
import { useAuth } from "../context/AuthContext";
import { InlineError, Spinner } from "../components/ui";
import { SUBJECT_NAMES } from "../lib/content";
import { GOAL_LABELS, type Board, type ClassLevel, type Goal, type Language, type Stream, type SubjectId } from "../lib/types";

export interface ProfileFormValues {
  name: string;
  classLevel: ClassLevel;
  board: Board;
  stream: Stream | null;
  language: Language;
  subjects: SubjectId[];
  goal: Goal;
}

export const DEFAULT_PROFILE_VALUES: ProfileFormValues = { name: "", classLevel: 10, board: "CBSE", stream: null, language: "en", subjects: [], goal: "board" };

export function subjectsForClass(classLevel: ClassLevel): SubjectId[] {
  return classLevel <= 10 ? ["mathematics", "physics", "chemistry", "biology", "social_science", "english"] : ["physics", "chemistry", "mathematics", "biology"];
}

export function validateProfile(values: ProfileFormValues): string | null {
  if (values.name.trim().length < 1 || values.name.trim().length > 60) return "Enter your name (up to 60 characters).";
  if (values.subjects.length === 0) return "Pick at least one subject.";
  if (values.classLevel >= 11 && !values.stream) return "Choose your stream for Class 11 or 12.";
  return null;
}

export function ProfileFields({ values, onChange }: { values: ProfileFormValues; onChange: (next: ProfileFormValues) => void }) {
  const seniorClass = values.classLevel >= 11;
  const subjectChoices = subjectsForClass(values.classLevel);

  function setClass(classLevel: ClassLevel) {
    onChange({ ...values, classLevel, stream: classLevel >= 11 ? values.stream ?? "PCM" : null, subjects: values.subjects.filter((subject) => subjectsForClass(classLevel).includes(subject)) });
  }

  function toggleSubject(subject: SubjectId) {
    const subjects = values.subjects.includes(subject) ? values.subjects.filter((item) => item !== subject) : [...values.subjects, subject];
    onChange({ ...values, subjects });
  }

  return (
    <div className="space-y-3">
      <div>
        <label htmlFor="name" className="label">Name</label>
        <input id="name" className="input" maxLength={60} required value={values.name} onChange={(event) => onChange({ ...values, name: event.target.value })} />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label htmlFor="classLevel" className="label">Class</label>
          <select id="classLevel" className="input" value={values.classLevel} onChange={(event) => setClass(Number(event.target.value) as ClassLevel)}>
            {[9, 10, 11, 12].map((level) => <option key={level} value={level}>Class {level}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor="board" className="label">Board</label>
          <select id="board" className="input" value={values.board} onChange={(event) => onChange({ ...values, board: event.target.value as Board })}>
            <option value="CBSE">CBSE</option>
            <option value="ICSE">ICSE</option>
            <option value="State">State Board</option>
          </select>
        </div>
        {seniorClass && (
          <div>
            <label htmlFor="stream" className="label">Stream</label>
            <select id="stream" className="input" value={values.stream ?? "PCM"} onChange={(event) => onChange({ ...values, stream: event.target.value as Stream })}>
              <option value="PCM">PCM</option>
              <option value="PCB">PCB</option>
              <option value="PCMB">PCMB</option>
            </select>
          </div>
        )}
        <div>
          <label htmlFor="language" className="label">Preferred language</label>
          <select id="language" className="input" value={values.language} onChange={(event) => onChange({ ...values, language: event.target.value as Language })}>
            <option value="en">English</option>
            <option value="hi">Hindi</option>
          </select>
        </div>
        <div>
          <label htmlFor="goal" className="label">Goal</label>
          <select id="goal" className="input" value={values.goal} onChange={(event) => onChange({ ...values, goal: event.target.value as Goal })}>
            {(Object.keys(GOAL_LABELS) as Goal[]).map((goal) => <option key={goal} value={goal}>{GOAL_LABELS[goal]}</option>)}
          </select>
        </div>
      </div>
      <fieldset>
        <legend className="label">Subjects</legend>
        <div className="flex flex-wrap gap-2">
          {subjectChoices.map((subject) => (
            <label key={subject} className={`cursor-pointer rounded-lg border px-3 py-1.5 text-sm ${values.subjects.includes(subject) ? "border-brand-500 bg-brand-50 text-brand-700" : "border-ink-200"}`}>
              <input type="checkbox" className="sr-only" checked={values.subjects.includes(subject)} onChange={() => toggleSubject(subject)} />
              {SUBJECT_NAMES[subject]}
            </label>
          ))}
        </div>
      </fieldset>
    </div>
  );
}

export default function RegisterPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, profile, loading } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [values, setValues] = useState<ProfileFormValues>(DEFAULT_PROFILE_VALUES);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const completingProfile = Boolean(user) && !profile;

  if (loading) return <div className="flex min-h-screen items-center justify-center"><Spinner /></div>;
  if (user && profile) return <Navigate to="/dashboard" replace />;

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    const validation = validateProfile(values);
    if (validation) {
      setError(validation);
      return;
    }
    if (!completingProfile && password.length < 6) {
      setError("Password must be at least 6 characters.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const account = completingProfile && user ? user : (await createUserWithEmailAndPassword(auth, email.trim(), password)).user;
      const userProfileData = {
        uid: account.uid,
        email: account.email,
        name: values.name.trim(),
        classLevel: values.classLevel,
        board: values.board,
        stream: values.classLevel >= 11 ? values.stream : null,
        language: values.language,
        subjects: values.subjects,
        goal: values.goal,
        role: "student",
        xp: 0,
        stars: 0,
        questionsSolved: 0,
        modulesCompleted: 0,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      };
      await setDoc(doc(db, "users", account.uid), userProfileData);

      // Also persist to central server users database
      try {
        await fetch("/api/users/sync", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(userProfileData)
        });
      } catch {
        // Safe fallback
      }

      navigate("/dashboard", { replace: true });
    } catch (caught) {
      console.error("Registration failed", caught);
      const code = (caught as { code?: string }).code;
      setError(
        code === "auth/email-already-in-use" ? "An account with this email already exists. Log in instead."
          : code === "auth/weak-password" ? "Choose a stronger password (at least 6 characters)."
          : code === "auth/invalid-email" ? "That email address does not look right."
          : "Could not create your account. Please try again."
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-ink-100 p-6">
      <form onSubmit={onSubmit} className="card w-full max-w-xl">
        <p className="text-lg font-bold text-brand-700">VidyaPath AI</p>
        <h1 className="mt-1 text-2xl font-bold">{completingProfile ? "Complete your profile" : "Create your account"}</h1>
        {(location.state as { completeProfile?: boolean } | null)?.completeProfile && (
          <p className="mt-1 text-sm text-ink-500">Your account exists but the student profile is missing. Fill it in to continue.</p>
        )}
        {!completingProfile && (
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <div>
              <label htmlFor="email" className="label">Email</label>
              <input id="email" type="email" autoComplete="email" required className="input" value={email} onChange={(event) => setEmail(event.target.value)} />
            </div>
            <div>
              <label htmlFor="password" className="label">Password</label>
              <input id="password" type="password" autoComplete="new-password" required minLength={6} className="input" value={password} onChange={(event) => setPassword(event.target.value)} />
            </div>
          </div>
        )}
        <div className="mt-4">
          <ProfileFields values={values} onChange={setValues} />
        </div>
        <InlineError message={error} />
        <button type="submit" className="btn-primary mt-4 w-full" disabled={busy}>{busy ? "Creating..." : completingProfile ? "Save profile" : "Create account"}</button>
        {!completingProfile && <p className="mt-4 text-center text-sm">Already registered? <Link to="/login" className="text-brand-600">Log in</Link></p>}
      </form>
    </div>
  );
}
