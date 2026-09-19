import { FieldValue } from "firebase-admin/firestore";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { db, loadConfig, requireNumber, requireString, requireUid } from "../lib/admin.js";
import { applyOutcome, readUserContext } from "../lib/engine.js";

const MAX_MINUTES_PER_CALL = 60;
const MAX_MINUTES_PER_DAY = 600;
const KINDS = new Set(["learning", "revision", "problems"]);

/**
 * Record study time from a client timer. Minutes are capped per call and per day, and the
 * session id makes retries idempotent. A revision session counts toward the streak on its own.
 */
export const recordStudySession = onCall(async (request) => {
  const uid = requireUid(request);
  const data = (request.data ?? {}) as { sessionId?: unknown; topicId?: unknown; minutes?: unknown; kind?: unknown };
  const sessionId = requireString(data.sessionId, "sessionId", 80);
  const minutes = Math.round(requireNumber(data.minutes, "minutes", 1, MAX_MINUTES_PER_CALL));
  const kind = requireString(data.kind, "kind", 20);
  if (!KINDS.has(kind)) throw new HttpsError("invalid-argument", "Invalid session kind.");
  const topicId = typeof data.topicId === "string" && data.topicId.length <= 120 ? data.topicId : null;
  const config = await loadConfig();
  const eventId = `session_${uid}_${sessionId}`;

  return db.runTransaction(async (txn) => {
    const ctx = await readUserContext(txn, uid, eventId, config);
    if (ctx.eventDone) return { alreadyRecorded: true };
    const allowedMinutes = Math.max(0, Math.min(minutes, MAX_MINUTES_PER_DAY - ctx.activity.minutes));
    const isRevision = kind === "revision";
    txn.set(db.doc(`studySessions/${eventId}`), {
      id: eventId,
      userId: uid,
      topicId,
      kind,
      minutes: allowedMinutes,
      date: ctx.today,
      createdAt: FieldValue.serverTimestamp()
    });
    const rewards = applyOutcome(txn, ctx, {
      eventId,
      reason: isRevision ? "revision_session" : "study_session",
      refId: topicId ?? kind,
      xp: isRevision ? config.revisionXp : allowedMinutes * config.studyMinuteXp,
      stars: 0,
      activity: { minutes: allowedMinutes, revisions: isRevision ? 1 : 0 },
      stats: { revisionsCompleted: isRevision ? 1 : 0 }
    });
    return { alreadyRecorded: false, minutesCounted: allowedMinutes, rewards };
  });
});
