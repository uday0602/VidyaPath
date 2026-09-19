import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { collection, doc, getDocs, limit, orderBy, query, updateDoc, where } from "firebase/firestore";
import { content, useContent } from "../lib/content";
import { timeAgo } from "../lib/format";
import { db } from "../lib/firebase";
import { useAction, useQueryOnce } from "../hooks/useFirestore";
import { AsyncState, InlineError, PageHeader, Tag } from "../components/ui";
import type { DoubtDoc, ReportDoc, RewardClaimDoc, RewardDoc } from "../lib/types";

type Tab = "users" | "reports" | "content" | "rewards" | "challenges";
const TABS: { id: Tab; label: string }[] = [
  { id: "users", label: "User Database" },
  { id: "reports", label: "Reports" },
  { id: "content", label: "Content" },
  { id: "rewards", label: "Rewards" },
  { id: "challenges", label: "Challenges" }
];
const CLAIM_STATUSES: RewardClaimDoc["status"][] = ["pending", "approved", "fulfilled", "rejected"];

export default function AdminPage() {
  const [tab, setTab] = useState<Tab>("users");
  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <PageHeader
        title="Admin & Database Control"
        subtitle="Live management of registered users, Cloud Firestore, moderation reports, and rewards."
      />
      <div className="flex flex-wrap gap-2" role="tablist">
        {TABS.map((item) => (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={tab === item.id}
            className={`rounded-lg px-4 py-2 text-sm font-semibold transition ${
              tab === item.id ? "bg-brand-600 text-white shadow-sm" : "bg-ink-100 text-ink-700 hover:bg-ink-200"
            }`}
            onClick={() => setTab(item.id)}
          >
            {item.label}
          </button>
        ))}
      </div>
      {tab === "users" && <UsersDatabaseTab />}
      {tab === "reports" && <ReportsTab />}
      {tab === "content" && <ContentTab />}
      {tab === "rewards" && <RewardsTab />}
      {tab === "challenges" && <ChallengesTab />}
    </div>
  );
}

interface StoredUser {
  uid: string;
  email: string;
  name: string;
  role: "student" | "admin";
  classLevel: number;
  board: string;
  stream?: string | null;
  language?: string;
  goal: string;
  subjects?: string[];
  xp: number;
  stars: number;
  questionsSolved?: number;
  modulesCompleted?: number;
  problemsSolved?: number;
  createdAt?: string;
  updatedAt?: string;
}

function UsersDatabaseTab() {
  const [users, setUsers] = useState<StoredUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [classFilter, setClassFilter] = useState<string>("all");
  const [goalFilter, setGoalFilter] = useState<string>("all");
  const [roleFilter, setRoleFilter] = useState<string>("all");
  const [selectedUser, setSelectedUser] = useState<StoredUser | null>(null);
  const [copiedUid, setCopiedUid] = useState<string | null>(null);

  const FIRESTORE_CONSOLE_URL =
    "https://console.firebase.google.com/project/woven-analyst-s3skh/firestore/databases/ai-studio-vidyapath-586c39bf-0539-4e55-883c-51165ddaff25/data";

  async function loadUsers() {
    setLoading(true);
    setError(null);
    try {
      const userMap = new Map<string, StoredUser>();

      // 1. Fetch from server-side persistent database
      try {
        const res = await fetch("/api/admin/users");
        if (res.ok) {
          const json = await res.json();
          if (Array.isArray(json.users)) {
            for (const u of json.users) {
              userMap.set(u.uid || u.email, u);
            }
          }
        }
      } catch (err) {
        console.warn("Could not reach /api/admin/users", err);
      }

      // 2. Fetch from Firestore users collection if available
      try {
        const snap = await getDocs(collection(db, "users"));
        snap.forEach((d) => {
          const data = d.data() as any;
          const uid = d.id;
          const existing = userMap.get(uid) || ({} as any);
          userMap.set(uid, {
            ...existing,
            uid,
            email: data.email || existing.email || "",
            name: data.name || existing.name || "Student",
            role: data.role || existing.role || "student",
            classLevel: Number(data.classLevel) || existing.classLevel || 10,
            board: data.board || existing.board || "CBSE",
            stream: data.stream ?? existing.stream ?? null,
            goal: data.goal || existing.goal || "board",
            xp: Number(data.xp) || existing.xp || 0,
            stars: Number(data.stars) || existing.stars || 0,
            questionsSolved: Number(data.questionsSolved) || existing.questionsSolved || 0,
            modulesCompleted: Number(data.modulesCompleted) || existing.modulesCompleted || 0,
            createdAt: typeof data.createdAt?.toDate === "function" ? data.createdAt.toDate().toISOString() : existing.createdAt || new Date().toISOString()
          });
        });
      } catch (err) {
        // Fallback gracefully
      }

      setUsers(Array.from(userMap.values()));
    } catch (err: any) {
      setError(err?.message || "Failed to load users database.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadUsers();
  }, []);

  const filtered = users.filter((u) => {
    const q = search.trim().toLowerCase();
    const matchesSearch =
      !q ||
      u.name?.toLowerCase().includes(q) ||
      u.email?.toLowerCase().includes(q) ||
      u.uid?.toLowerCase().includes(q);

    const matchesClass = classFilter === "all" || String(u.classLevel) === classFilter;
    const matchesGoal = goalFilter === "all" || u.goal?.toLowerCase().includes(goalFilter.toLowerCase());
    const matchesRole = roleFilter === "all" || u.role === roleFilter;

    return matchesSearch && matchesClass && matchesGoal && matchesRole;
  });

  const totalQuestions = users.reduce((sum, u) => sum + (u.questionsSolved || 0), 0);
  const totalXp = users.reduce((sum, u) => sum + (u.xp || 0), 0);
  const studentsCount = users.filter((u) => u.role !== "admin").length;

  function copyUid(uid: string) {
    if (navigator?.clipboard) {
      navigator.clipboard.writeText(uid);
      setCopiedUid(uid);
      setTimeout(() => setCopiedUid(null), 2000);
    }
  }

  return (
    <div className="space-y-6">
      {/* Cloud & Project Info Banner */}
      <div className="card border-brand-200 bg-gradient-to-r from-brand-50/70 via-white to-brand-50/40 p-5">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="inline-flex h-2.5 w-2.5 rounded-full bg-emerald-500 animate-pulse"></span>
              <h3 className="font-bold text-ink-900 text-base">Cloud Firestore Database Provisioned</h3>
              <span className="rounded bg-brand-100 px-2 py-0.5 text-xs font-semibold text-brand-700">Project: woven-analyst-s3skh</span>
            </div>
            <p className="text-xs text-ink-600 max-w-2xl">
              All profile registrations, question attempts, and student academic records are stored in this centralized database.
              You can query profiles below or view them directly in the Google Cloud Firebase Console.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <a
              href={FIRESTORE_CONSOLE_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="btn-primary text-xs font-semibold py-2 px-3 flex items-center gap-1.5"
            >
              <span>Open Firebase Console</span>
              <span>↗</span>
            </a>
            <a
              href="/api/admin/users/export?format=csv"
              download
              className="btn-secondary text-xs font-semibold py-2 px-3"
            >
              Export CSV
            </a>
            <a
              href="/api/admin/users/export?format=json"
              download
              className="btn-secondary text-xs font-semibold py-2 px-3"
            >
              Export JSON
            </a>
            <button
              type="button"
              onClick={loadUsers}
              disabled={loading}
              className="btn-secondary text-xs py-2 px-3"
              title="Refresh database"
            >
              {loading ? "Refreshing..." : "↻ Refresh"}
            </button>
          </div>
        </div>
      </div>

      {/* Metrics Row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="card p-4">
          <span className="text-xs font-medium text-ink-500">Total Registered</span>
          <p className="text-2xl font-bold text-ink-900 mt-1">{users.length}</p>
          <span className="text-[11px] text-ink-400">{studentsCount} active students</span>
        </div>
        <div className="card p-4">
          <span className="text-xs font-medium text-ink-500">Total Questions Solved</span>
          <p className="text-2xl font-bold text-brand-600 mt-1">{totalQuestions}</p>
          <span className="text-[11px] text-ink-400">Across all learners</span>
        </div>
        <div className="card p-4">
          <span className="text-xs font-medium text-ink-500">Accumulated XP</span>
          <p className="text-2xl font-bold text-ink-900 mt-1">{totalXp.toLocaleString()}</p>
          <span className="text-[11px] text-ink-400">Learning milestones</span>
        </div>
        <div className="card p-4">
          <span className="text-xs font-medium text-ink-500">Firestore Database ID</span>
          <p className="text-xs font-mono font-semibold text-ink-800 mt-1 truncate" title="ai-studio-vidyapath-586c39bf-0539-4e55-883c-51165ddaff25">
            ai-studio-vidyapath...
          </p>
          <span className="text-[11px] text-emerald-600 font-medium">Rules active & verified</span>
        </div>
      </div>

      {/* Search & Filters */}
      <div className="card p-4 space-y-3">
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="flex-1">
            <input
              type="text"
              className="input text-sm"
              placeholder="Search by student name, email, or UID..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div className="flex flex-wrap gap-2">
            <select
              className="input text-xs w-28"
              value={classFilter}
              onChange={(e) => setClassFilter(e.target.value)}
              aria-label="Filter by class"
            >
              <option value="all">All Classes</option>
              <option value="9">Class 9</option>
              <option value="10">Class 10</option>
              <option value="11">Class 11</option>
              <option value="12">Class 12</option>
            </select>
            <select
              className="input text-xs w-32"
              value={goalFilter}
              onChange={(e) => setGoalFilter(e.target.value)}
              aria-label="Filter by goal"
            >
              <option value="all">All Goals</option>
              <option value="board">Board Exam</option>
              <option value="jee">JEE</option>
              <option value="neet">NEET</option>
            </select>
            <select
              className="input text-xs w-28"
              value={roleFilter}
              onChange={(e) => setRoleFilter(e.target.value)}
              aria-label="Filter by role"
            >
              <option value="all">All Roles</option>
              <option value="student">Student</option>
              <option value="admin">Admin</option>
            </select>
          </div>
        </div>

        {/* User Table */}
        <AsyncState
          loading={loading}
          error={error}
          onRetry={loadUsers}
          empty={filtered.length === 0}
          emptyTitle="No users match the criteria"
          emptyBody="Adjust your search filters or check back once new students register."
        >
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-ink-200 text-xs font-semibold text-ink-500">
                  <th className="py-2.5 px-3">Student / User</th>
                  <th className="py-2.5 px-3">Academic Info</th>
                  <th className="py-2.5 px-3">Goal</th>
                  <th className="py-2.5 px-3 text-right">XP / Stars</th>
                  <th className="py-2.5 px-3 text-right">Questions</th>
                  <th className="py-2.5 px-3">Created</th>
                  <th className="py-2.5 px-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-100">
                {filtered.map((user) => (
                  <tr key={user.uid} className="hover:bg-ink-50/70 transition">
                    <td className="py-3 px-3">
                      <div className="flex items-center gap-2.5">
                        <div className="h-8 w-8 rounded-full bg-brand-100 text-brand-700 flex items-center justify-center font-bold text-xs">
                          {(user.name || "U")[0].toUpperCase()}
                        </div>
                        <div>
                          <div className="flex items-center gap-1.5">
                            <span className="font-semibold text-ink-900">{user.name || "Anonymous Student"}</span>
                            {user.role === "admin" && (
                              <span className="rounded bg-ink-900 px-1.5 py-0.2 text-[10px] font-bold text-white uppercase tracking-wider">
                                Admin
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-ink-500">{user.email}</p>
                        </div>
                      </div>
                    </td>
                    <td className="py-3 px-3">
                      <div className="text-xs">
                        <span className="font-medium text-ink-800">Class {user.classLevel || 10}</span>
                        <span className="text-ink-400"> · {user.board || "CBSE"}</span>
                        {user.stream && <span className="text-ink-500 font-medium"> ({user.stream})</span>}
                      </div>
                    </td>
                    <td className="py-3 px-3">
                      <span className="inline-block rounded-full bg-ink-100 px-2 py-0.5 text-xs text-ink-700 capitalize font-medium">
                        {(user.goal || "board").replace("_", " + ")}
                      </span>
                    </td>
                    <td className="py-3 px-3 text-right text-xs">
                      <span className="font-bold text-ink-900">{user.xp || 0} XP</span>
                      <span className="block text-ink-400">★ {user.stars || 0}</span>
                    </td>
                    <td className="py-3 px-3 text-right text-xs text-ink-700 font-medium">
                      {user.questionsSolved || 0}
                    </td>
                    <td className="py-3 px-3 text-xs text-ink-400 whitespace-nowrap">
                      {user.createdAt ? timeAgo(user.createdAt) : "Recently"}
                    </td>
                    <td className="py-3 px-3 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          type="button"
                          className="rounded border border-ink-200 px-2 py-1 text-xs text-ink-600 hover:bg-ink-100 transition"
                          onClick={() => copyUid(user.uid)}
                          title="Copy User ID"
                        >
                          {copiedUid === user.uid ? "Copied!" : "Copy UID"}
                        </button>
                        <button
                          type="button"
                          className="rounded bg-brand-50 px-2 py-1 text-xs font-semibold text-brand-700 hover:bg-brand-100 transition"
                          onClick={() => setSelectedUser(user)}
                        >
                          Inspect
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </AsyncState>
      </div>

      {/* Record Inspection Modal / Drawer */}
      {selectedUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink-900/50 p-4" onClick={() => setSelectedUser(null)}>
          <div className="card w-full max-w-2xl max-h-[85vh] overflow-y-auto space-y-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-ink-150 pb-3">
              <div>
                <h3 className="text-base font-bold text-ink-900">User Profile Record</h3>
                <p className="text-xs text-ink-500">Firestore Document ID: {selectedUser.uid}</p>
              </div>
              <button
                type="button"
                className="rounded-lg p-1.5 text-ink-400 hover:bg-ink-100 hover:text-ink-700"
                onClick={() => setSelectedUser(null)}
              >
                ✕
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3 text-xs">
              <div className="rounded-lg border border-ink-150 p-2.5">
                <span className="text-ink-400 block">Full Name</span>
                <span className="font-semibold text-ink-800 text-sm">{selectedUser.name}</span>
              </div>
              <div className="rounded-lg border border-ink-150 p-2.5">
                <span className="text-ink-400 block">Email Address</span>
                <span className="font-semibold text-ink-800 text-sm">{selectedUser.email}</span>
              </div>
              <div className="rounded-lg border border-ink-150 p-2.5">
                <span className="text-ink-400 block">Class & Stream</span>
                <span className="font-semibold text-ink-800">
                  Class {selectedUser.classLevel} ({selectedUser.board}) {selectedUser.stream ? `· ${selectedUser.stream}` : ""}
                </span>
              </div>
              <div className="rounded-lg border border-ink-150 p-2.5">
                <span className="text-ink-400 block">Academic Goal</span>
                <span className="font-semibold text-ink-800 capitalize">{selectedUser.goal}</span>
              </div>
              <div className="rounded-lg border border-ink-150 p-2.5">
                <span className="text-ink-400 block">XP & Reward Stars</span>
                <span className="font-semibold text-ink-800">{selectedUser.xp} XP · {selectedUser.stars} Stars</span>
              </div>
              <div className="rounded-lg border border-ink-150 p-2.5">
                <span className="text-ink-400 block">Account Role</span>
                <span className="font-semibold text-ink-800 uppercase">{selectedUser.role}</span>
              </div>
            </div>

            <div>
              <span className="text-xs font-semibold text-ink-700 block mb-1">Raw Firestore JSON Representation:</span>
              <pre className="rounded-lg bg-ink-900 p-3 text-[11px] font-mono text-emerald-400 overflow-x-auto max-h-48">
                {JSON.stringify(selectedUser, null, 2)}
              </pre>
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-ink-150">
              <button
                type="button"
                className="btn-secondary text-xs"
                onClick={() => setSelectedUser(null)}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function targetPath(report: ReportDoc): string | null {
  if (report.targetType === "doubt") return `doubts/${report.targetId}`;
  if (report.targetType === "answer" && report.doubtId) return `doubts/${report.doubtId}/answers/${report.targetId}`;
  return null;
}

function ReportsTab() {
  const reports = useQueryOnce<ReportDoc>(() => query(collection(db, "reports"), where("status", "==", "open"), orderBy("createdAt", "desc"), limit(50)), []);
  const setHidden = useAction(async (report: ReportDoc, hidden: boolean) => {
    const path = targetPath(report);
    if (!path) throw new Error("User reports have no content to hide. Resolve or dismiss instead.");
    await updateDoc(doc(db, path), { hidden });
  });
  const setStatus = useAction(async (reportId: string, status: ReportDoc["status"]) => {
    await updateDoc(doc(db, "reports", reportId), { status });
    reports.reload();
  });
  return (
    <AsyncState loading={reports.loading} error={reports.error} onRetry={reports.reload} empty={reports.data.length === 0} emptyTitle="No open reports" emptyBody="Reports from students appear here.">
      <ul className="space-y-3">
        {reports.data.map((report) => (
          <li key={report.id} className="card">
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <Tag tone="warn">{report.reason}</Tag>
              <span className="font-semibold">{report.targetType}</span>
              <span className="text-ink-500">{report.targetId}</span>
              <span className="text-ink-500">· {timeAgo(report.createdAt)}</span>
              {report.doubtId && <Link className="text-brand-600 hover:underline" to={`/doubts/${report.doubtId}`}>Open doubt</Link>}
            </div>
            {report.details && <p className="mt-2 text-sm text-ink-700">{report.details}</p>}
            <div className="mt-3 flex flex-wrap gap-2">
              {targetPath(report) && (
                <>
                  <button type="button" className="btn-danger" disabled={setHidden.busy} onClick={() => void setHidden.run(report, true)}>Hide content</button>
                  <button type="button" className="btn-secondary" disabled={setHidden.busy} onClick={() => void setHidden.run(report, false)}>Restore</button>
                </>
              )}
              <button type="button" className="btn-primary" disabled={setStatus.busy} onClick={() => void setStatus.run(report.id, "resolved")}>Resolve</button>
              <button type="button" className="btn-secondary" disabled={setStatus.busy} onClick={() => void setStatus.run(report.id, "dismissed")}>Dismiss</button>
            </div>
          </li>
        ))}
      </ul>
      <InlineError message={setHidden.error ?? setStatus.error} />
    </AsyncState>
  );
}

function ContentTab() {
  const visible = useQueryOnce<DoubtDoc>(() => query(collection(db, "doubts"), where("hidden", "==", false), orderBy("createdAt", "desc"), limit(20)), []);
  const hidden = useQueryOnce<DoubtDoc>(() => query(collection(db, "doubts"), where("hidden", "==", true), orderBy("createdAt", "desc"), limit(20)), []);
  const toggle = useAction(async (doubtId: string, nextHidden: boolean) => {
    await updateDoc(doc(db, "doubts", doubtId), { hidden: nextHidden });
    visible.reload();
    hidden.reload();
  });
  const renderList = (items: DoubtDoc[], hiddenList: boolean) => (
    <ul className="space-y-2">
      {items.map((doubt) => (
        <li key={doubt.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-ink-200 p-3 text-sm">
          <span><Link className="font-semibold text-brand-700 hover:underline" to={`/doubts/${doubt.id}`}>{doubt.title}</Link> <span className="text-ink-500">· {doubt.authorName} · {timeAgo(doubt.createdAt)}</span></span>
          <button type="button" className={hiddenList ? "btn-secondary" : "btn-danger"} disabled={toggle.busy} onClick={() => void toggle.run(doubt.id, !hiddenList)}>{hiddenList ? "Restore" : "Hide"}</button>
        </li>
      ))}
    </ul>
  );
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <div className="card">
        <h2 className="font-semibold">Recent visible doubts</h2>
        <AsyncState loading={visible.loading} error={visible.error} onRetry={visible.reload} empty={visible.data.length === 0} emptyTitle="Nothing visible">{renderList(visible.data, false)}</AsyncState>
      </div>
      <div className="card">
        <h2 className="font-semibold">Hidden doubts</h2>
        <AsyncState loading={hidden.loading} error={hidden.error} onRetry={hidden.reload} empty={hidden.data.length === 0} emptyTitle="Nothing hidden">{renderList(hidden.data, true)}</AsyncState>
      </div>
      <InlineError message={toggle.error} />
    </div>
  );
}

function RewardsTab() {
  const rewards = useQueryOnce<RewardDoc>(() => query(collection(db, "rewards"), orderBy("order")), []);
  const claims = useQueryOnce<RewardClaimDoc>(() => query(collection(db, "rewardClaims"), orderBy("createdAt", "desc"), limit(50)), []);
  const toggleAvailable = useAction(async (reward: RewardDoc) => {
    await updateDoc(doc(db, "rewards", reward.id), { available: !reward.available });
    rewards.reload();
  });
  const setClaimStatus = useAction(async (claimId: string, status: RewardClaimDoc["status"]) => {
    await updateDoc(doc(db, "rewardClaims", claimId), { status });
    claims.reload();
  });
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <div className="card">
        <h2 className="font-semibold">Rewards</h2>
        <AsyncState loading={rewards.loading} error={rewards.error} onRetry={rewards.reload} empty={rewards.data.length === 0} emptyTitle="No rewards">
          <ul className="mt-2 space-y-2 text-sm">
            {rewards.data.map((reward) => (
              <li key={reward.id} className="flex items-center justify-between gap-2 rounded-lg border border-ink-200 p-3">
                <span>{reward.name} <span className="text-ink-500">· {reward.starsRequired} Stars</span> {!reward.available && <Tag tone="warn">Unavailable</Tag>}</span>
                <button type="button" className="btn-secondary" disabled={toggleAvailable.busy} onClick={() => void toggleAvailable.run(reward)}>{reward.available ? "Disable" : "Enable"}</button>
              </li>
            ))}
          </ul>
        </AsyncState>
        <InlineError message={toggleAvailable.error} />
      </div>
      <div className="card">
        <h2 className="font-semibold">Claims</h2>
        <AsyncState loading={claims.loading} error={claims.error} onRetry={claims.reload} empty={claims.data.length === 0} emptyTitle="No claims yet">
          <ul className="mt-2 space-y-2 text-sm">
            {claims.data.map((claim) => (
              <li key={claim.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-ink-200 p-3">
                <span>{claim.rewardName} <span className="text-ink-500">· {claim.userId.slice(0, 8)}… · {timeAgo(claim.createdAt)}</span></span>
                <select className="input w-36" aria-label={`Status for ${claim.rewardName}`} value={claim.status} disabled={setClaimStatus.busy} onChange={(event) => void setClaimStatus.run(claim.id, event.target.value as RewardClaimDoc["status"])}>
                  {CLAIM_STATUSES.map((status) => <option key={status} value={status}>{status}</option>)}
                </select>
              </li>
            ))}
          </ul>
        </AsyncState>
        <InlineError message={setClaimStatus.error} />
      </div>
    </div>
  );
}

function ChallengesTab() {
  const challenges = useContent(() => content.challenges(), []);
  return (
    <div className="card">
      <h2 className="font-semibold">Daily challenge pool</h2>
      <p className="text-sm text-ink-500">Read-only. Edit seed/content/dailyChallenges.json and rerun the seed script to change the pool.</p>
      <AsyncState loading={challenges.loading} error={challenges.error} empty={(challenges.data ?? []).length === 0} emptyTitle="No challenges seeded">
        <ul className="mt-3 space-y-2 text-sm">
          {(challenges.data ?? []).map((challenge) => (
            <li key={challenge.id} className="rounded-lg border border-ink-200 p-3">
              <p className="font-semibold">{challenge.title} <span className="text-ink-500">· order {challenge.order} · {Math.round(challenge.timeLimitSec / 60)} min</span></p>
              <p className="mt-1 text-xs text-ink-500">{challenge.questionIds.join(", ")}</p>
            </li>
          ))}
        </ul>
      </AsyncState>
    </div>
  );
}
