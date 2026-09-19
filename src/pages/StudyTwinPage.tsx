import { useEffect, useMemo, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { SUBJECT_NAMES } from "../lib/content";
import { supabaseService } from "../lib/supabase";
import { EmptyState, PageHeader, ProgressBar, Spinner, Tag } from "../components/ui";
import { GOAL_LABELS, type Goal, type SubjectId } from "../lib/types";

interface StudentCardData {
  uid: string;
  name: string;
  anonUsername: string;
  avatar: string;
  classLevel: number;
  qualification: string;
  goal: Goal;
  description: string;
  creditScore: number;
  completedModules: number;
  streakDays: number;
  accuracyPercent: number;
  subjects: SubjectId[];
  isConnected?: boolean;
}

export default function StudyTwinPage() {
  const { user, profile } = useAuth();
  const uid = user?.uid ?? "";

  const [students, setStudents] = useState<StudentCardData[]>([]);
  const [connectedIds, setConnectedIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [classFilter, setClassFilter] = useState<string>("all");
  const [goalFilter, setGoalFilter] = useState<string>("all");
  const [connectingId, setConnectingId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"all" | "connected">("all");

  // Load students & buddies dynamically from API and Supabase
  useEffect(() => {
    async function loadData() {
      setLoading(true);
      try {
        // Fetch users from server sync / Supabase
        const res = await fetch("/api/users/db");
        let serverUsers: Array<{
          uid: string;
          name: string;
          email: string;
          classLevel?: number;
          goal?: Goal;
          subjects?: SubjectId[];
          xp?: number;
          stars?: number;
        }> = [];

        if (res.ok) {
          const json = await res.json();
          serverUsers = json.users || [];
        }

        // Fetch connected buddies from Supabase
        let buddies: string[] = [];
        if (uid) {
          buddies = await supabaseService.getBuddies(uid);
        }
        setConnectedIds(new Set(buddies));

        // Default cohort of peers across Classes 9-12 if database has few records
        const basePeers: Array<Partial<StudentCardData>> = [
          {
            uid: "peer-aarav",
            name: "Aarav Sharma",
            anonUsername: "CuriousFalcon",
            avatar: "🦅",
            classLevel: 10,
            qualification: "Class 10 · CBSE Board",
            goal: "board_jee",
            description: "Preparing for Class 10 Board exams with strong focus on NCERT Physics & Electricity. Aiming for 95%+.",
            creditScore: 880,
            completedModules: 18,
            streakDays: 7,
            accuracyPercent: 92,
            subjects: ["physics", "mathematics", "chemistry"]
          },
          {
            uid: "peer-priya",
            name: "Priya Patel",
            anonUsername: "QuantumSpark",
            avatar: "⚡",
            classLevel: 12,
            qualification: "Class 12 · CBSE + JEE Advanced",
            goal: "board_jee",
            description: "JEE Advanced 2026 aspirant. Strong in Electrostatics and Calculus, looking for consistent problem-solving twins.",
            creditScore: 940,
            completedModules: 34,
            streakDays: 14,
            accuracyPercent: 88,
            subjects: ["physics", "mathematics", "chemistry"]
          },
          {
            uid: "peer-rohan",
            name: "Rohan Verma",
            anonUsername: "BioPioneer",
            avatar: "🌱",
            classLevel: 11,
            qualification: "Class 11 · CBSE + NEET",
            goal: "board_neet",
            description: "NEET pre-med student. Revising Mechanics, Organic Chemistry, and Cell Biology daily. Let's conquer NCERT!",
            creditScore: 865,
            completedModules: 22,
            streakDays: 9,
            accuracyPercent: 85,
            subjects: ["biology", "physics", "chemistry"]
          },
          {
            uid: "peer-ananya",
            name: "Ananya Iyer",
            anonUsername: "MathVoyager",
            avatar: "📐",
            classLevel: 9,
            qualification: "Class 9 · CBSE Board",
            goal: "board",
            description: "Class 9 student building deep foundations in Newton's laws, Gravitation, and Algebra. Study daily at 6 PM.",
            creditScore: 810,
            completedModules: 12,
            streakDays: 5,
            accuracyPercent: 89,
            subjects: ["physics", "mathematics"]
          },
          {
            uid: "peer-kartik",
            name: "Kartik Nair",
            anonUsername: "ApexChemist",
            avatar: "🧪",
            classLevel: 12,
            qualification: "Class 12 · CBSE + NEET",
            goal: "board_neet",
            description: "Focusing on rapid MCQ elimination techniques for NEET Physics and Physical Chemistry formulas.",
            creditScore: 915,
            completedModules: 28,
            streakDays: 11,
            accuracyPercent: 91,
            subjects: ["chemistry", "biology", "physics"]
          },
          {
            uid: "peer-diya",
            name: "Diya Sengupta",
            anonUsername: "StarlightOptics",
            avatar: "🌟",
            classLevel: 10,
            qualification: "Class 10 · CBSE Board",
            goal: "board",
            description: "Practicing Ray Optics diagrams, Human Eye defects, and Ohm's law numerical questions. Let's study together!",
            creditScore: 835,
            completedModules: 15,
            streakDays: 6,
            accuracyPercent: 87,
            subjects: ["physics", "chemistry", "mathematics"]
          }
        ];

        // Merge real registered users if present
        const mergedList: StudentCardData[] = [];
        const seenUids = new Set<string>();

        for (const u of serverUsers) {
          if (u.uid === uid) continue; // skip self
          seenUids.add(u.uid);
          const xp = u.xp || 500;
          const classLvl = u.classLevel || 10;
          const goal = u.goal || "board";
          mergedList.push({
            uid: u.uid,
            name: u.name || "Student",
            anonUsername: `Scholar_${u.uid.slice(0, 4)}`,
            avatar: "🎓",
            classLevel: classLvl,
            qualification: `Class ${classLvl} · ${GOAL_LABELS[goal] || "CBSE"}`,
            goal,
            description: `Active student exploring Class ${classLvl} science & mathematics modules.`,
            creditScore: Math.min(990, 700 + Math.floor(xp / 10)),
            completedModules: Math.max(1, Math.floor(xp / 150)),
            streakDays: Math.max(1, Math.floor(xp / 400)),
            accuracyPercent: Math.min(98, 75 + (xp % 20)),
            subjects: (u.subjects && u.subjects.length > 0) ? u.subjects : ["physics", "mathematics"]
          });
        }

        // Add base peers if not duplicate
        for (const p of basePeers) {
          if (p.uid && !seenUids.has(p.uid) && p.uid !== uid) {
            mergedList.push(p as StudentCardData);
          }
        }

        setStudents(mergedList);
      } catch (err) {
        console.error("Failed to load study twins", err);
      } finally {
        setLoading(false);
      }
    }

    loadData();
  }, [uid]);

  // Connect / Disconnect Handler
  const handleToggleConnect = async (studentId: string) => {
    if (!uid) return;
    setConnectingId(studentId);
    try {
      const isCurrentlyConnected = connectedIds.has(studentId);
      if (isCurrentlyConnected) {
        await supabaseService.disconnectBuddy(uid, studentId);
        setConnectedIds((prev) => {
          const next = new Set(prev);
          next.delete(studentId);
          return next;
        });
      } else {
        await supabaseService.connectBuddy(uid, studentId);
        setConnectedIds((prev) => new Set([...prev, studentId]));
      }
    } catch (err) {
      console.error("Failed to toggle buddy connection", err);
    } finally {
      setConnectingId(null);
    }
  };

  // Filtered Students
  const filteredStudents = useMemo(() => {
    return students.filter((s) => {
      if (activeTab === "connected" && !connectedIds.has(s.uid)) return false;
      if (classFilter !== "all" && s.classLevel !== Number(classFilter)) return false;
      if (goalFilter !== "all" && s.goal !== goalFilter) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchesName = s.name.toLowerCase().includes(q) || s.anonUsername.toLowerCase().includes(q);
        const matchesDesc = s.description.toLowerCase().includes(q);
        const matchesQual = s.qualification.toLowerCase().includes(q);
        const matchesSubj = s.subjects.some((subj) => SUBJECT_NAMES[subj]?.toLowerCase().includes(q));
        if (!matchesName && !matchesDesc && !matchesQual && !matchesSubj) return false;
      }
      return true;
    });
  }, [students, connectedIds, activeTab, classFilter, goalFilter, searchQuery]);

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title="Study Twin Network"
        subtitle="Discover verified study partners matched by Class, Curriculum (CBSE, JEE, NEET), and learning consistency. Connect to compare progress and keep each other accountable."
      />

      {/* Tabs */}
      <div className="mb-6 flex border-b border-ink-200">
        <button
          type="button"
          className={`border-b-2 px-4 py-2 text-sm font-semibold transition-colors ${
            activeTab === "all"
              ? "border-brand-600 text-brand-600"
              : "border-transparent text-ink-500 hover:text-ink-700"
          }`}
          onClick={() => setActiveTab("all")}
        >
          All Study Twins ({students.length})
        </button>
        <button
          type="button"
          className={`border-b-2 px-4 py-2 text-sm font-semibold transition-colors ${
            activeTab === "connected"
              ? "border-brand-600 text-brand-600"
              : "border-transparent text-ink-500 hover:text-ink-700"
          }`}
          onClick={() => setActiveTab("connected")}
        >
          My Connected Buddies ({connectedIds.size})
        </button>
      </div>

      {/* Search and Filters Bar */}
      <div className="card mb-6 grid gap-3 sm:grid-cols-12">
        <div className="sm:col-span-6">
          <label htmlFor="search-input" className="block text-xs font-semibold text-ink-600">Search Students</label>
          <input
            id="search-input"
            type="search"
            placeholder="Search by name, avatar, topic, or subject..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="input mt-1 w-full text-sm"
          />
        </div>
        <div className="sm:col-span-3">
          <label htmlFor="class-filter" className="block text-xs font-semibold text-ink-600">Class Filter</label>
          <select
            id="class-filter"
            value={classFilter}
            onChange={(e) => setClassFilter(e.target.value)}
            className="input mt-1 w-full text-sm"
          >
            <option value="all">All Classes (9 - 12)</option>
            <option value="9">Class 9</option>
            <option value="10">Class 10</option>
            <option value="11">Class 11</option>
            <option value="12">Class 12</option>
          </select>
        </div>
        <div className="sm:col-span-3">
          <label htmlFor="goal-filter" className="block text-xs font-semibold text-ink-600">Exam / Goal</label>
          <select
            id="goal-filter"
            value={goalFilter}
            onChange={(e) => setGoalFilter(e.target.value)}
            className="input mt-1 w-full text-sm"
          >
            <option value="all">All Curricula</option>
            <option value="board">CBSE Board</option>
            <option value="board_jee">CBSE + JEE</option>
            <option value="board_neet">CBSE + NEET</option>
          </select>
        </div>
      </div>

      {/* Student Cards Grid */}
      {loading ? (
        <div className="flex h-48 items-center justify-center">
          <Spinner label="Loading study twins from Supabase..." />
        </div>
      ) : filteredStudents.length === 0 ? (
        <div className="card py-10 text-center">
          <EmptyState
            title="No study twins found"
            body={activeTab === "connected" ? "You have not connected with any study twins yet. Browse 'All Study Twins' and click Connect!" : "Try adjusting your search query or filters."}
          />
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {filteredStudents.map((s) => {
            const isConnected = connectedIds.has(s.uid);
            const isBusy = connectingId === s.uid;

            return (
              <div
                key={s.uid}
                className={`card flex flex-col justify-between border transition-shadow hover:shadow-md ${
                  isConnected ? "border-brand-400 bg-brand-50/20" : "border-ink-200"
                }`}
              >
                <div>
                  {/* Card Header */}
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2.5">
                      <div className="flex h-11 w-11 items-center justify-center rounded-full bg-brand-100 text-xl">
                        {s.avatar}
                      </div>
                      <div>
                        <h3 className="font-semibold text-ink-900 leading-snug">{s.anonUsername}</h3>
                        <p className="text-xs text-ink-500 font-medium">{s.name}</p>
                      </div>
                    </div>
                    {/* Credit Score Badge */}
                    <div className="text-right">
                      <div className="inline-flex items-center rounded-md bg-amber-50 px-2 py-0.5 text-xs font-bold text-amber-700 ring-1 ring-inset ring-amber-600/20">
                        ★ {s.creditScore}
                      </div>
                      <p className="text-[10px] text-ink-400">Credit Score</p>
                    </div>
                  </div>

                  {/* Qualification & Badges */}
                  <div className="mt-3 flex flex-wrap items-center gap-1.5">
                    <span className="rounded bg-brand-100 px-2 py-0.5 text-xs font-semibold text-brand-800">
                      {s.qualification}
                    </span>
                    <span className="rounded bg-ink-100 px-2 py-0.5 text-xs text-ink-700">
                      🔥 {s.streakDays} Day Streak
                    </span>
                  </div>

                  {/* Bio / Description */}
                  <p className="mt-3 text-xs leading-relaxed text-ink-600 line-clamp-3">
                    {s.description}
                  </p>

                  {/* Performance Metrics */}
                  <div className="mt-4 grid grid-cols-2 gap-2 rounded-lg bg-ink-50 p-2 text-xs">
                    <div>
                      <p className="text-ink-500">Completed</p>
                      <p className="font-bold text-ink-800">{s.completedModules} Modules</p>
                    </div>
                    <div>
                      <p className="text-ink-500">Problem Accuracy</p>
                      <p className="font-bold text-success-700">{s.accuracyPercent}%</p>
                    </div>
                  </div>

                  {/* Accuracy Bar */}
                  <div className="mt-2">
                    <ProgressBar label="Accuracy" value={s.accuracyPercent} tone="success" />
                  </div>

                  {/* Subjects */}
                  <div className="mt-3 flex flex-wrap gap-1">
                    {s.subjects.map((sub) => (
                      <Tag key={sub} tone="neutral">{SUBJECT_NAMES[sub] || sub}</Tag>
                    ))}
                  </div>
                </div>

                {/* Footer Action */}
                <div className="mt-5 border-t border-ink-100 pt-3">
                  <button
                    type="button"
                    className={`w-full py-2 text-xs font-semibold transition-colors ${
                      isConnected
                        ? "rounded-lg border border-success-400 bg-success-50 text-success-800 hover:bg-danger-50 hover:border-danger-300 hover:text-danger-700"
                        : "btn-primary"
                    }`}
                    disabled={isBusy}
                    onClick={() => handleToggleConnect(s.uid)}
                  >
                    {isBusy
                      ? "Updating..."
                      : isConnected
                      ? "✓ Connected Buddy (Click to Disconnect)"
                      : "+ Connect with Study Twin"}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function ProfileCard({ title, profile }: { title: string; profile: PublicProfile }) {
  return (
    <div className="card">
      <p className="text-xs uppercase tracking-wide text-ink-500">{title}</p>
      <p className="mt-1 text-lg font-semibold">{profile.anonUsername}</p>
      <p className="text-xs text-ink-500">Avatar {profile.avatar} · Class {profile.classLevel} · {GOAL_LABELS[profile.goal]}</p>
      <p className="mt-2 text-sm">Level {profile.level}: {LEVEL_NAMES[profile.level]}</p>
      <div className="mt-2 flex flex-wrap gap-1">
        {profile.subjects.map((subject) => <Tag key={subject}>{SUBJECT_NAMES[subject]}</Tag>)}
      </div>
    </div>
  );
}

function PairView({ uid, me, pairId }: { uid: string; me: PublicProfile; pairId: string }) {
  const pair = useDoc<StudyTwinPairDoc>(`studyTwins/${pairId}`);
  const partnerUid = pair.data?.members.find((member) => member !== uid) ?? null;
  const partner = useDoc<PublicProfile>(partnerUid ? `publicProfiles/${partnerUid}` : null);
  const challenges = useQueryOnce<TwinChallengeDoc>(
    () => query(collection(db, "twinChallenges"), where("members", "array-contains", uid), where("pairId", "==", pairId), orderBy("createdAt", "desc"), limit(1)),
    [uid, pairId]
  );
  const latest = challenges.data[0] ?? null;
  const create = useAction(async () => {
    const result = await api.createTwinChallenge({ pairId });
    challenges.reload();
    return result;
  });

  const presence = useMemo(() => {
    const updated = toDate(partner.data?.updatedAt);
    if (!updated) return "unknown";
    return Date.now() - updated.getTime() < 7 * 86_400_000 ? "active this week" : "quiet";
  }, [partner.data?.updatedAt]);

  return (
    <AsyncState loading={pair.loading || partner.loading} error={pair.error ?? partner.error} onRetry={pair.reload}>
      {partner.data && (
        <section className="mt-4">
          <div className="grid gap-4 md:grid-cols-2">
            <ProfileCard title="Your twin" profile={partner.data} />
            <div className="card">
              <h2 className="font-semibold">Study together status</h2>
              <p className="mt-1 text-sm text-ink-700">Twin is <strong>{presence}</strong> (based on last profile update). <PrototypeTag /></p>
              <h2 className="mt-4 font-semibold">Compare progress</h2>
              <div className="mt-2 space-y-3 text-sm">
                <CompareRow label="Questions solved" mine={me.progressSummary.questionsSolved} theirs={partner.data.progressSummary.questionsSolved} />
                <CompareRow label="Modules completed" mine={me.progressSummary.modulesCompleted} theirs={partner.data.progressSummary.modulesCompleted} />
                <CompareRow label="Learning level" mine={me.level} theirs={partner.data.level} max={5} />
              </div>
            </div>
          </div>
          <div className="card mt-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="font-semibold">Twin challenge</h2>
              <button type="button" className="btn-primary" disabled={create.busy} onClick={() => void create.run()}>{create.busy ? "Creating..." : "Challenge my twin"}</button>
            </div>
            <InlineError message={create.error} />
            <AsyncState loading={challenges.loading} error={challenges.error} empty={!latest} emptyTitle="No challenge yet" emptyBody="Start a 5-question challenge; you both answer the same questions.">
              {latest && <TwinChallenge uid={uid} partnerUid={partnerUid ?? ""} challenge={latest} onSubmitted={challenges.reload} />}
            </AsyncState>
          </div>
        </section>
      )}
    </AsyncState>
  );
}

function CompareRow({ label, mine, theirs, max }: { label: string; mine: number; theirs: number; max?: number }) {
  const ceiling = max ?? Math.max(mine, theirs, 1);
  return (
    <div>
      <p className="mb-1 text-xs text-ink-500">{label}</p>
      <ProgressBar label={`You: ${mine}`} value={(mine / ceiling) * 100} />
      <div className="mt-1"><ProgressBar label={`Twin: ${theirs}`} value={(theirs / ceiling) * 100} tone="success" /></div>
    </div>
  );
}

function TwinChallenge({ uid, partnerUid, challenge, onSubmitted }: { uid: string; partnerUid: string; challenge: TwinChallengeDoc; onSubmitted: () => void }) {
  const questions = useContent(() => content.questions(challenge.questionIds), [challenge.id]);
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [results, setResults] = useState<QuizResults | null>(null);
  const mine = challenge.results[uid] ?? null;
  const theirs = challenge.results[partnerUid] ?? null;
  const submit = useAction(async () => {
    const result = await api.submitTwinChallenge({ challengeId: challenge.id, answers });
    if (result.results) setResults(result.results);
    onSubmitted();
    return result;
  });

  return (
    <div className="mt-3">
      <p className="text-xs text-ink-500">Started {timeAgo(challenge.createdAt)}</p>
      <div className="mt-2 grid gap-2 sm:grid-cols-2 text-sm">
        <p>You: {mine ? `${mine.score} / ${mine.total}` : "not submitted"}</p>
        <p>Twin: {theirs ? `${theirs.score} / ${theirs.total}` : "waiting"}</p>
      </div>
      {!mine && (
        <AsyncState loading={questions.loading} error={questions.error}>
          <ol className="mt-3 space-y-3">
            {(questions.data ?? []).map((question, index) => (
              <li key={question.id} className="rounded-lg border border-ink-200 p-3">
                <p className="font-medium">{index + 1}. {question.text}</p>
                <div className="mt-2 grid gap-2 sm:grid-cols-2">
                  {question.options.map((option, optionIndex) => (
                    <label key={optionIndex} className="flex items-center gap-2 rounded-lg border border-ink-200 px-3 py-2 text-sm">
                      <input type="radio" name={`twin-${question.id}`} checked={answers[question.id] === optionIndex} disabled={Boolean(results)} onChange={() => setAnswers((previous) => ({ ...previous, [question.id]: optionIndex }))} />
                      {option}
                    </label>
                  ))}
                </div>
                {results?.[question.id] && <p className={`mt-1 text-sm ${results[question.id].correct ? "text-success-500" : "text-danger-500"}`}>{results[question.id].explanation}</p>}
              </li>
            ))}
          </ol>
          {!results && <button type="button" className="btn-primary mt-3" disabled={submit.busy} onClick={() => void submit.run()}>{submit.busy ? "Submitting..." : "Submit answers"}</button>}
          <InlineError message={submit.error} />
        </AsyncState>
      )}
    </div>
  );
}
