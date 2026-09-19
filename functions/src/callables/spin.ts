import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { db, loadConfig, requireUid } from "../lib/admin.js";
import { applyOutcome, readUserContext, toMillis } from "../lib/engine.js";
import { canSpin, pickOutcome } from "../lib/spin.js";

/**
 * The server decides eligibility, result and reward. The event id is derived from the
 * spin counter, so two overlapping requests collide on the same event and only one pays out.
 */
export const spinWheel = onCall(async (request) => {
  const uid = requireUid(request);
  const config = await loadConfig();
  const stateRef = db.doc(`spinState/${uid}`);
  const preview = await stateRef.get();
  const totalSpins = (preview.get("totalSpins") as number | undefined) ?? 0;
  const eventId = `spin_${uid}_${totalSpins + 1}`;

  return db.runTransaction(async (txn) => {
    const ctx = await readUserContext(txn, uid, eventId, config);
    const stateSnap = await txn.get(stateRef);
    const nextSpinAtMs = toMillis(stateSnap.get("nextSpinAt"));
    const currentSpins = (stateSnap.get("totalSpins") as number | undefined) ?? 0;
    if (ctx.eventDone || currentSpins !== totalSpins) {
      throw new HttpsError("already-exists", "Spin already in progress. Refresh to see the result.");
    }
    if (!canSpin(nextSpinAtMs, ctx.now.getTime())) {
      throw new HttpsError("failed-precondition", "Spin is on cooldown.", { nextSpinAt: nextSpinAtMs });
    }
    const outcome = pickOutcome(config.spinOutcomes, Math.random());
    const nextSpinAt = Timestamp.fromMillis(ctx.now.getTime() + config.spinCooldownHours * 3600_000);
    txn.set(stateRef, { uid, nextSpinAt, lastResult: outcome.label, totalSpins: currentSpins + 1 }, { merge: true });
    const historyRef = db.collection("spinHistory").doc(eventId);
    txn.set(historyRef, { id: eventId, userId: uid, result: outcome.label, xp: outcome.xp, stars: outcome.stars, createdAt: FieldValue.serverTimestamp() });
    const rewards = applyOutcome(txn, ctx, {
      eventId,
      reason: "spin_wheel",
      refId: historyRef.id,
      xp: outcome.xp,
      stars: outcome.stars,
      badgeIds: outcome.badgeId ? [outcome.badgeId] : []
    });
    return { result: outcome.label, xp: outcome.xp, stars: outcome.stars, badgeId: outcome.badgeId, nextSpinAt: nextSpinAt.toMillis(), rewards };
  });
});
