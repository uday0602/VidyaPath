import { useEffect, useState, type FormEvent } from "react";
import { doc, serverTimestamp, updateDoc } from "firebase/firestore";
import { Link } from "react-router-dom";
import { db } from "../lib/firebase";
import { useAuth } from "../context/AuthContext";
import { usePreferences } from "../context/PreferencesContext";
import { InlineError, PageHeader, StatTile, Tag } from "../components/ui";
import { errorMessage } from "../lib/callables";
import { titleCase } from "../lib/format";
import { DEFAULT_PROFILE_VALUES, ProfileFields, validateProfile, type ProfileFormValues } from "./RegisterPage";

export default function SettingsPage() {
  const { user, profile } = useAuth();
  const preferences = usePreferences();
  const [values, setValues] = useState<ProfileFormValues>(DEFAULT_PROFILE_VALUES);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (profile) {
      setValues({ name: profile.name, classLevel: profile.classLevel, board: profile.board, stream: profile.stream, language: profile.language, subjects: profile.subjects, goal: profile.goal });
    }
  }, [profile]);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (busy || !user) return;
    const validation = validateProfile(values);
    if (validation) {
      setError(validation);
      return;
    }
    setBusy(true);
    setError(null);
    setSaved(false);
    try {
      await updateDoc(doc(db, "users", user.uid), {
        name: values.name.trim(),
        classLevel: values.classLevel,
        board: values.board,
        stream: values.classLevel >= 11 ? values.stream : null,
        language: values.language,
        subjects: values.subjects,
        goal: values.goal,
        updatedAt: serverTimestamp()
      });
      setSaved(true);
    } catch (caught) {
      console.error("Profile update failed", caught);
      setError(errorMessage(caught));
    } finally {
      setBusy(false);
    }
  }

  const badgeIds = ((profile as unknown as { badgeIds?: string[] } | null)?.badgeIds) ?? [];

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="Profile settings" subtitle="Your learning details. Rewards and progress are managed by the server and cannot be edited here." />
      <div className="mb-6 grid gap-3 sm:grid-cols-3">
        <StatTile label="XP" value={profile?.xp ?? 0} />
        <StatTile label="Stars" value={profile?.stars ?? 0} />
        <div className="card">
          <p className="text-xs font-medium uppercase tracking-wide text-ink-500">Badges</p>
          <div className="mt-2 flex flex-wrap gap-1">
            {badgeIds.length === 0 ? <span className="text-sm text-ink-500">None yet</span> : badgeIds.map((badge) => <Tag key={badge} tone="brand">{titleCase(badge)}</Tag>)}
          </div>
        </div>
      </div>
      <form onSubmit={onSubmit} className="card">
        <ProfileFields values={values} onChange={setValues} />
        <InlineError message={error} />
        {saved && <p className="mt-2 text-sm text-success-500" role="status">Profile saved.</p>}
        <div className="mt-4 flex flex-wrap gap-2">
          <button type="submit" className="btn-primary" disabled={busy}>{busy ? "Saving..." : "Save changes"}</button>
          <Link to="/reset-password" className="btn-secondary">Change password</Link>
        </div>
      </form>
      <section className="card mt-6" aria-labelledby="prefs-heading">
        <h2 id="prefs-heading" className="font-semibold">Display preferences</h2>
        <p className="text-sm text-ink-500">Stored on this device only.</p>
        <label className="mt-3 flex items-center justify-between py-1 text-sm"><span>Low Data Mode (no images, fewer effects)</span><input type="checkbox" checked={preferences.lowData} onChange={(event) => preferences.update({ lowData: event.target.checked })} /></label>
        <label className="flex items-center justify-between py-1 text-sm"><span>Reduce motion</span><input type="checkbox" checked={preferences.reduceMotion} onChange={(event) => preferences.update({ reduceMotion: event.target.checked })} /></label>
        <label className="flex items-center justify-between py-1 text-sm">
          <span>Text size</span>
          <select className="input w-28" value={preferences.fontScale} onChange={(event) => preferences.update({ fontScale: Number(event.target.value) as 1 | 1.125 | 1.25 })}>
            <option value={1}>Normal</option>
            <option value={1.125}>Large</option>
            <option value={1.25}>Larger</option>
          </select>
        </label>
      </section>
    </div>
  );
}
