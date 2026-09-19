import { useState } from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { usePreferences } from "../context/PreferencesContext";
import { GOAL_LABELS } from "../lib/types";

const NAV = [
  { to: "/dashboard", label: "Dashboard" },
  { to: "/learn", label: "My Learning" },
  { to: "/ncert", label: "NCERT" },
  { to: "/exam/board", label: "Board Prep" },
  { to: "/exam/jee", label: "JEE Foundation" },
  { to: "/exam/neet", label: "NEET Foundation" },
  { to: "/problem-lab", label: "Problem Lab" },
  { to: "/ai-tutor", label: "AI Tutor" },
  { to: "/revision", label: "Revision" },
  { to: "/planner", label: "Study Planner" },
  { to: "/progress", label: "Progress" },
  { to: "/study-twin", label: "Study Twin" },
  { to: "/challenges", label: "Challenges" },
  { to: "/rewards", label: "Rewards" },
  { to: "/doubts", label: "Doubt Forum" },
  { to: "/careers", label: "Career Explorer" }
];

export function AppShell() {
  const { profile, streak, isAdmin, logout } = useAuth();
  const preferences = usePreferences();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");

  const nav = (
    <nav aria-label="Main navigation" className="flex flex-col gap-0.5">
      {NAV.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          onClick={() => setOpen(false)}
          className={({ isActive }) => `rounded-lg px-3 py-2 text-sm font-medium ${isActive ? "bg-brand-600 text-white" : "text-ink-700 hover:bg-ink-100"}`}
        >
          {item.label}
        </NavLink>
      ))}
      {isAdmin && (
        <NavLink to="/admin" onClick={() => setOpen(false)} className={({ isActive }) => `mt-2 flex items-center justify-between rounded-lg px-3 py-2 text-sm font-medium ${isActive ? "bg-ink-900 text-white" : "text-ink-800 bg-brand-50/70 border border-brand-200/60 hover:bg-brand-100/70"}`}>
          <span>User Database & Admin</span>
          <span className="rounded bg-brand-200/70 px-1.5 py-0.5 text-[10px] font-bold text-brand-800">DB</span>
        </NavLink>
      )}
    </nav>
  );

  return (
    <div className="min-h-screen lg:flex">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-50 focus:rounded focus:bg-white focus:px-3 focus:py-2">Skip to content</a>
      <aside className="hidden w-64 shrink-0 border-r border-ink-200 bg-white p-4 lg:block">
        <Brand />
        <div className="mt-6">{nav}</div>
      </aside>
      {open && (
        <div className="fixed inset-0 z-40 bg-ink-900/40 lg:hidden" onClick={() => setOpen(false)}>
          <aside className="h-full w-72 bg-white p-4" onClick={(event) => event.stopPropagation()}>
            <Brand />
            <div className="mt-6">{nav}</div>
          </aside>
        </div>
      )}
      <div className="flex min-h-screen flex-1 flex-col">
        <header className="sticky top-0 z-30 flex items-center gap-3 border-b border-ink-200 bg-white px-4 py-3">
          <button type="button" className="btn-secondary lg:hidden" onClick={() => setOpen(true)} aria-label="Open navigation">☰</button>
          <form
            role="search"
            className="flex-1"
            onSubmit={(event) => {
              event.preventDefault();
              if (search.trim()) navigate(`/search?q=${encodeURIComponent(search.trim())}`);
            }}
          >
            <label htmlFor="global-search" className="sr-only">Search topics, chapters, problems</label>
            <input id="global-search" className="input max-w-md" placeholder="Search topics, chapters, problems..." value={search} onChange={(event) => setSearch(event.target.value)} />
          </form>
          <div className="hidden items-center gap-3 text-sm sm:flex">
            <span title="Current streak">🔥 {streak?.current ?? 0}</span>
            <span title="XP">⚡ {profile?.xp ?? 0}</span>
            <span title="Stars">⭐ {profile?.stars ?? 0}</span>
          </div>
          <details className="relative">
            <summary className="btn-secondary cursor-pointer list-none" aria-label="Account menu">{profile?.name?.split(" ")[0] ?? "Account"}</summary>
            <div className="absolute right-0 mt-2 w-64 rounded-xl border border-ink-200 bg-white p-3 text-sm shadow-lg">
              {profile && (
                <p className="mb-2 text-ink-500">Class {profile.classLevel} · {profile.board} · {GOAL_LABELS[profile.goal]}</p>
              )}
              <label className="flex items-center justify-between py-1"><span>Low Data Mode</span><input type="checkbox" checked={preferences.lowData} onChange={(event) => preferences.update({ lowData: event.target.checked })} /></label>
              <label className="flex items-center justify-between py-1"><span>Reduce motion</span><input type="checkbox" checked={preferences.reduceMotion} onChange={(event) => preferences.update({ reduceMotion: event.target.checked })} /></label>
              <label className="flex items-center justify-between py-1">
                <span>Text size</span>
                <select className="input w-24" value={preferences.fontScale} onChange={(event) => preferences.update({ fontScale: Number(event.target.value) as 1 | 1.125 | 1.25 })}>
                  <option value={1}>Normal</option>
                  <option value={1.125}>Large</option>
                  <option value={1.25}>Larger</option>
                </select>
              </label>
              <NavLink to="/settings" className="btn-ghost mt-2 w-full">Profile settings</NavLink>
              <button type="button" className="btn-secondary mt-2 w-full" onClick={() => logout().then(() => navigate("/login"))}>Log out</button>
            </div>
          </details>
        </header>
        <main id="main" className="flex-1 p-4 sm:p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

function Brand() {
  return (
    <NavLink to="/dashboard" className="block">
      <p className="text-lg font-bold text-brand-700">VidyaPath AI</p>
      <p className="text-xs text-ink-500">One Path. From School to Success.</p>
    </NavLink>
  );
}
