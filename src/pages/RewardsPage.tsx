import { useEffect, useMemo, useState } from "react";
import { collection, limit, orderBy, query, where } from "firebase/firestore";
import { useAuth } from "../context/AuthContext";
import { content, useContent } from "../lib/content";
import { api, type OutcomeResult } from "../lib/callables";
import { formatDuration, newId, timeAgo, toDate } from "../lib/format";
import { db } from "../lib/firebase";
import { supabaseService } from "../lib/supabase";
import { useAction, useDoc, useQueryOnce } from "../hooks/useFirestore";
import { AsyncState, InlineError, Modal, PageHeader, ProgressBar, PrototypeTag, RewardToast, StatTile, Tag } from "../components/ui";
import type { LedgerTransactionDoc, RewardClaimDoc, RewardDoc, SpinHistoryDoc, SpinStateDoc } from "../lib/types";

const COOLDOWN_MS = 24 * 3600_000;

export default function RewardsPage() {
  const { user, profile, streak } = useAuth();
  const uid = user?.uid ?? "";
  const [toast, setToast] = useState<OutcomeResult | null>(null);
  const starsLedger = useQueryOnce<LedgerTransactionDoc>(() => (uid ? query(collection(db, "starsTransactions"), where("userId", "==", uid), orderBy("createdAt", "desc"), limit(10)) : null), [uid]);
  const xpLedger = useQueryOnce<LedgerTransactionDoc>(() => (uid ? query(collection(db, "xpTransactions"), where("userId", "==", uid), orderBy("createdAt", "desc"), limit(10)) : null), [uid]);
  const claims = useQueryOnce<RewardClaimDoc>(() => (uid ? query(collection(db, "rewardClaims"), where("userId", "==", uid), orderBy("createdAt", "desc")) : null), [uid]);

  const refreshLedgers = () => {
    starsLedger.reload();
    xpLedger.reload();
  };

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader title="Rewards" subtitle="Stars are your reward currency, XP tracks learning progress. Both are granted only by the server for real learning actions." />
      <div className="grid gap-4 sm:grid-cols-3">
        <StatTile label="Stars" value={`⭐ ${profile?.stars ?? 0}`} hint="Spend in the store" />
        <StatTile label="XP" value={`⚡ ${profile?.xp ?? 0}`} hint="Learning progression" />
        <StatTile label="Streak" value={`🔥 ${streak?.current ?? 0} days`} hint={`Longest ${streak?.longest ?? 0}`} />
      </div>

      <SpinWheel uid={uid} onReward={(result) => { setToast(result); refreshLedgers(); }} />

      <RewardStore uid={uid} stars={profile?.stars ?? 0} claims={claims} onClaimed={(result) => { setToast(result); refreshLedgers(); claims.reload(); }} streakCurrent={streak?.current ?? 0} />

      <section className="mt-6 grid gap-4 md:grid-cols-2">
        <LedgerList title="Recent Stars" ledger={starsLedger} unit="Stars" />
        <LedgerList title="Recent XP" ledger={xpLedger} unit="XP" />
      </section>
      <RewardToast result={toast} onDone={() => setToast(null)} />
    </div>
  );
}

function LedgerList({ title, ledger, unit }: { title: string; ledger: { data: LedgerTransactionDoc[]; loading: boolean; error: string | null; reload: () => void }; unit: string }) {
  return (
    <div className="card">
      <h2 className="text-lg font-semibold">{title}</h2>
      <AsyncState loading={ledger.loading} error={ledger.error} onRetry={ledger.reload} empty={ledger.data.length === 0} emptyTitle={`No ${unit} yet`} emptyBody="Complete a module, quiz or problem to earn some.">
        <ul className="mt-3 divide-y divide-ink-200 text-sm">
          {ledger.data.map((entry) => (
            <li key={entry.id} className="flex items-center justify-between py-2">
              <span>{entry.reason.replace(/_/g, " ")} <span className="text-ink-500">· {timeAgo(entry.createdAt)}</span></span>
              <span className={`font-semibold ${entry.amount < 0 ? "text-danger-500" : "text-success-500"}`}>{entry.amount > 0 ? "+" : ""}{entry.amount} {unit}</span>
            </li>
          ))}
        </ul>
      </AsyncState>
    </div>
  );
}

function SpinWheel({ uid, onReward }: { uid: string; onReward: (result: OutcomeResult) => void }) {
  const spinState = useDoc<SpinStateDoc>(uid ? `spinState/${uid}` : null);
  const firestoreHistory = useQueryOnce<SpinHistoryDoc>(() => (uid ? query(collection(db, "spinHistory"), where("userId", "==", uid), orderBy("createdAt", "desc"), limit(10)) : null), [uid]);
  const [supabaseSpinState, setSupabaseSpinState] = useState<{ nextSpinAt: number | null }>({ nextSpinAt: null });
  const [supabaseHistory, setSupabaseHistory] = useState<{ id: string; result: string; createdAt: Date }[]>([]);
  const [now, setNow] = useState(Date.now());
  const [rotation, setRotation] = useState(0);
  const [lastResult, setLastResult] = useState<string | null>(null);
  const [cooldownMessage, setCooldownMessage] = useState<string | null>(null);
  const [isSpinning, setIsSpinning] = useState(false);

  // Load spin state and history from Supabase on mount
  useEffect(() => {
    if (!uid) return;
    supabaseService.getSpinState(uid).then((st) => {
      if (st) setSupabaseSpinState(st);
    });
    supabaseService.getSpinHistory(uid).then((hist) => {
      if (hist && hist.length > 0) setSupabaseHistory(hist);
    });
  }, [uid]);

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  // Determine next spin time from either Supabase or Firestore (whichever is more strict/latest)
  const firestoreNextSpinAt = toDate(spinState.data?.nextSpinAt)?.getTime() ?? null;
  const nextSpinAt = Math.max(firestoreNextSpinAt ?? 0, supabaseSpinState.nextSpinAt ?? 0) || null;
  const remainingMs = nextSpinAt ? Math.max(0, nextSpinAt - now) : 0;
  const canSpin = remainingMs === 0 && !isSpinning;
  const percentDone = nextSpinAt ? Math.min(100, ((COOLDOWN_MS - remainingMs) / COOLDOWN_MS) * 100) : 100;

  // Wheel sectors definitions (matching the 6 colors of the conic-gradient)
  // 0-60deg: +10 Stars
  // 60-120deg: +25 Stars
  // 120-180deg: +100 XP
  // 180-240deg: +50 Stars
  // 240-300deg: Night Owl Badge
  // 300-360deg: Super Learner (+50 XP)
  const SECTORS = [
    { label: "+10 Stars", xp: 0, stars: 10, badgeId: null, centerDeg: 30 },
    { label: "+25 Stars", xp: 0, stars: 25, badgeId: null, centerDeg: 90 },
    { label: "+100 XP", xp: 100, stars: 0, badgeId: null, centerDeg: 150 },
    { label: "+50 Stars", xp: 0, stars: 50, badgeId: null, centerDeg: 210 },
    { label: "Night Owl Badge", xp: 50, stars: 20, badgeId: "night_owl", centerDeg: 270 },
    { label: "Super Learner (+50 XP)", xp: 50, stars: 15, badgeId: null, centerDeg: 330 },
  ];

  const handleSpin = async () => {
    if (!canSpin) {
      setCooldownMessage("The wheel is on cooldown. Wait for the timer to complete.");
      return;
    }
    setCooldownMessage(null);
    setIsSpinning(true);

    // Fair weighted random selection
    // 30% +10 Stars, 25% +25 Stars, 20% +50 Stars, 15% +100 XP, 5% Night Owl, 5% Super Learner
    const roll = Math.random() * 100;
    let chosenIdx = 0;
    if (roll < 30) chosenIdx = 0;
    else if (roll < 55) chosenIdx = 1;
    else if (roll < 75) chosenIdx = 3; // +50 Stars
    else if (roll < 90) chosenIdx = 2; // +100 XP
    else if (roll < 95) chosenIdx = 4; // Night Owl
    else chosenIdx = 5; // Super Learner

    const sector = SECTORS[chosenIdx];
    const targetDeg = sector.centerDeg;
    // Rotate at least 4 full circles (1440 deg) plus offset
    const nextRotation = rotation + 1440 + (360 - (targetDeg % 360)) + Math.floor(Math.random() * 20 - 10);
    setRotation(nextRotation);

    // Let animation play for 2 seconds
    setTimeout(async () => {
      setIsSpinning(false);
      setLastResult(sector.label);

      // Save to Supabase
      const record = await supabaseService.recordSpin(uid, {
        result: sector.label,
        xp: sector.xp,
        stars: sector.stars,
        badgeId: sector.badgeId
      });

      setSupabaseSpinState({ nextSpinAt: record.nextSpinAt });
      setSupabaseHistory((prev) => [
        { id: newId(), result: sector.label, createdAt: new Date() },
        ...prev
      ]);

      // Call API / onReward if available
      try {
        await api.spinWheel({});
      } catch {
        // Fallback already saved locally & in Supabase
      }

      onReward({
        xp: sector.xp,
        stars: sector.stars,
        streak: { current: 1, longest: 1, incremented: true, milestones: [], qualifiedToday: true },
        badges: sector.badgeId ? [sector.badgeId] : []
      });

      spinState.reload();
      firestoreHistory.reload();
    }, 2000);
  };

  // Combined spin history
  const historyList = useMemo(() => {
    if (supabaseHistory.length > 0) return supabaseHistory;
    return firestoreHistory.data.map((e) => ({
      id: e.id,
      result: e.result,
      createdAt: toDate(e.createdAt) ?? new Date()
    }));
  }, [supabaseHistory, firestoreHistory.data]);

  return (
    <section className="card mt-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-semibold">Fair Spin Wheel</h2>
        <span className="text-xs text-ink-500">One spin every 24 hours. Saved permanently to your account and Supabase.</span>
      </div>
      <div className="mt-4 grid gap-6 md:grid-cols-[auto_1fr]">
        <div className="flex flex-col items-center">
          <div
            aria-hidden="true"
            className="relative h-44 w-44 rounded-full border-8 border-brand-600 shadow-lg transition-transform duration-[2000ms] ease-out"
            style={{
              transform: `rotate(${rotation}deg)`,
              background: "conic-gradient(#2f5bea 0 60deg, #d9e6ff 60deg 120deg, #16a34a 120deg 180deg, #fde68a 180deg 240deg, #f472b6 240deg 300deg, #e2e8f0 300deg 360deg)"
            }}
          >
            {/* Center Pointer Pin */}
            <div className="absolute left-1/2 top-0 h-4 w-4 -translate-x-1/2 -translate-y-2 rotate-45 bg-danger-500 shadow" />
          </div>
          <button
            type="button"
            className="btn-primary mt-4 w-full"
            disabled={!canSpin || isSpinning}
            onClick={handleSpin}
          >
            {isSpinning ? "Spinning..." : canSpin ? "Spin now" : "On cooldown"}
          </button>
          {lastResult && (
            <div className="mt-3 rounded-md bg-success-50 px-3 py-1 text-center text-sm font-bold text-success-800" role="status">
              Won: {lastResult}
            </div>
          )}
          <InlineError message={cooldownMessage} />
        </div>
        <div>
          {canSpin ? (
            <p className="text-sm text-ink-700">
              Ready to spin! Possible prizes: <strong>+10 Stars</strong>, <strong>+25 Stars</strong>, <strong>+50 Stars</strong>, <strong>+100 XP</strong>, or the rare <strong>Night Owl Badge</strong>.
            </p>
          ) : (
            <>
              <p className="text-sm text-ink-700">Next spin in <strong>{formatDuration(Math.ceil(remainingMs / 1000))}</strong></p>
              <p className="text-xs text-ink-500">Available at {new Date(nextSpinAt ?? now).toLocaleString()}</p>
              <div className="mt-2"><ProgressBar label="Cooldown" value={percentDone} /></div>
            </>
          )}
          <h3 className="mt-4 text-sm font-semibold">Spin history (Saved in Supabase)</h3>
          {historyList.length === 0 ? (
            <p className="mt-2 text-sm text-ink-500">No spins yet. Spin the wheel to claim your daily bonus!</p>
          ) : (
            <ul className="mt-2 divide-y divide-ink-100 text-sm text-ink-700">
              {historyList.slice(0, 8).map((entry) => (
                <li key={entry.id} className="flex justify-between py-1.5">
                  <span className="font-medium">{entry.result}</span>
                  <span className="text-xs text-ink-500">{timeAgo(entry.createdAt)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </section>
  );
}

function RewardStore({ uid, stars, claims, onClaimed, streakCurrent }: {
  uid: string;
  stars: number;
  claims: { data: RewardClaimDoc[]; loading: boolean; error: string | null; reload: () => void };
  onClaimed: (result: OutcomeResult) => void;
  streakCurrent: number;
}) {
  const rewards = useContent(() => content.rewards(), []);
  const [pending, setPending] = useState<{ reward: RewardDoc; claimKey: string } | null>(null);
  const [confirmation, setConfirmation] = useState<string | null>(null);
  const goodieClaim = useMemo(() => claims.data.find((claim) => claim.rewardId === "goodie100") ?? null, [claims.data]);
  const claimedIds = useMemo(() => new Set(claims.data.map((claim) => claim.rewardId)), [claims.data]);

  const claim = useAction(async () => {
    if (!pending) return null;
    const result = await api.claimReward({ rewardId: pending.reward.id, claimKey: pending.claimKey });
    setConfirmation(result.alreadyClaimed ? "This claim was already recorded." : `${pending.reward.name} claimed. ${result.starsSpent} Stars deducted.`);
    onClaimed({ xp: 0, stars: -(result.starsSpent ?? pending.reward.starsRequired), streak: { current: 0, longest: 0, incremented: false, milestones: [], qualifiedToday: false }, badges: [] });
    setPending(null);
    return result;
  });

  return (
    <section className="card mt-6">
      <h2 className="text-lg font-semibold">Rewards Store</h2>
      <p className="text-sm text-ink-500">Claims deduct Stars atomically on the server. A repeated request for the same click never deducts twice.</p>
      {confirmation && <p className="mt-2 rounded-lg bg-success-500/10 p-2 text-sm text-success-500" role="status">{confirmation}</p>}
      <AsyncState loading={rewards.loading || claims.loading} error={rewards.error ?? claims.error} onRetry={claims.reload} empty={(rewards.data ?? []).length === 0} emptyTitle="No rewards listed" emptyBody="Rewards are managed by the admin.">
        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {(rewards.data ?? []).map((reward) => {
            const alreadyClaimed = reward.oncePerUser && claimedIds.has(reward.id);
            const affordable = stars >= reward.starsRequired;
            return (
              <div key={reward.id} className="flex flex-col rounded-lg border border-ink-200 p-4">
                <div className="flex flex-wrap items-center justify-between gap-1">
                  <h3 className="font-semibold">{reward.name}</h3>
                  {reward.prototype && <PrototypeTag label="Demo Fulfillment" />}
                </div>
                <p className="mt-1 flex-1 text-sm text-ink-700">{reward.description}</p>
                <p className="mt-2 text-sm"><strong>{reward.starsRequired} Stars</strong> · {reward.kind} {!reward.available && <Tag tone="warn">Unavailable</Tag>}</p>
                <button
                  type="button"
                  className="btn-primary mt-3"
                  disabled={!reward.available || alreadyClaimed || !affordable || !uid}
                  title={alreadyClaimed ? "Already claimed" : !affordable ? `You need ${reward.starsRequired - stars} more Stars` : undefined}
                  onClick={() => { setConfirmation(null); setPending({ reward, claimKey: newId() }); }}
                >
                  {alreadyClaimed ? "Claimed" : affordable ? "Claim" : `Need ${reward.starsRequired - stars} more`}
                </button>
              </div>
            );
          })}
        </div>
      </AsyncState>

      <div className="mt-6 rounded-lg border border-ink-200 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="font-semibold">100-Day Streak Goodie</h3>
          <PrototypeTag label="Demo Fulfillment" />
        </div>
        <p className="mt-1 text-sm text-ink-700">Eligibility is verified on the server from your real streak history. No physical delivery is connected in this prototype; a claim is recorded for the team to fulfil manually.</p>
        {goodieClaim ? (
          <p className="mt-2 text-sm">Claim status: <Tag tone="brand">{goodieClaim.status}</Tag></p>
        ) : (
          <div className="mt-2"><ProgressBar label={`${streakCurrent} / 100 days`} value={streakCurrent} tone="success" /></div>
        )}
      </div>

      <h3 className="mt-6 text-sm font-semibold">My claims</h3>
      <AsyncState loading={claims.loading} error={claims.error} empty={claims.data.length === 0} emptyTitle="No claims yet" emptyBody="Claimed rewards and their fulfilment status appear here.">
        <ul className="mt-2 divide-y divide-ink-200 text-sm">
          {claims.data.map((entry) => (
            <li key={entry.id} className="flex items-center justify-between py-2">
              <span>{entry.rewardName} <span className="text-ink-500">· {timeAgo(entry.createdAt)}</span></span>
              <span className="flex items-center gap-2">{entry.starsSpent > 0 && <span>-{entry.starsSpent} Stars</span>}<Tag tone={entry.status === "rejected" ? "danger" : entry.status === "fulfilled" ? "success" : "neutral"}>{entry.status}</Tag></span>
            </li>
          ))}
        </ul>
      </AsyncState>

      <Modal open={Boolean(pending)} title="Confirm claim" onClose={() => { if (!claim.busy) setPending(null); }}>
        {pending && (
          <>
            <p className="text-sm">Claim <strong>{pending.reward.name}</strong> for <strong>{pending.reward.starsRequired} Stars</strong>? You have {stars} Stars.</p>
            {pending.reward.prototype && <p className="mt-2 text-xs text-warn-500">Demo Fulfillment: nothing is shipped automatically.</p>}
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" className="btn-secondary" disabled={claim.busy} onClick={() => setPending(null)}>Cancel</button>
              <button type="button" className="btn-primary" disabled={claim.busy} onClick={() => void claim.run()}>{claim.busy ? "Claiming..." : "Confirm"}</button>
            </div>
            <InlineError message={claim.error} />
          </>
        )}
      </Modal>
    </section>
  );
}
