import { FieldValue } from "firebase-admin/firestore";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { db, loadConfig, requireString, requireUid } from "../lib/admin.js";
import { applyOutcome, readUserContext } from "../lib/engine.js";
import type { ModuleDoc } from "../types.js";

export const startModule = onCall(async (request) => {
  const uid = requireUid(request);
  const moduleId = requireString((request.data as { moduleId?: unknown })?.moduleId, "moduleId", 120);
  const moduleSnap = await db.doc(`modules/${moduleId}`).get();
  if (!moduleSnap.exists) throw new HttpsError("not-found", "Module not found.");
  const module = moduleSnap.data() as ModuleDoc;
  const progressRef = db.doc(`studentProgress/${uid}/modules/${moduleId}`);
  const existing = await progressRef.get();
  if (existing.exists) return { status: existing.get("status") };
  await progressRef.set({
    moduleId,
    topicId: module.topicId,
    subjectId: module.subjectId,
    status: "started",
    startedAt: FieldValue.serverTimestamp(),
    completedAt: null
  });
  return { status: "started" };
});

export const completeModule = onCall(async (request) => {
  const uid = requireUid(request);
  const moduleId = requireString((request.data as { moduleId?: unknown })?.moduleId, "moduleId", 120);
  const config = await loadConfig();
  const eventId = `module_${uid}_${moduleId}`;

  return db.runTransaction(async (txn) => {
    const ctx = await readUserContext(txn, uid, eventId, config);
    const moduleRef = db.doc(`modules/${moduleId}`);
    const progressRef = db.doc(`studentProgress/${uid}/modules/${moduleId}`);
    const [moduleSnap, progressSnap] = await txn.getAll(moduleRef, progressRef);
    if (!moduleSnap.exists) throw new HttpsError("not-found", "Module not found.");
    if (ctx.eventDone || progressSnap.get("status") === "completed") {
      return { alreadyCompleted: true, xp: 0, stars: 0 };
    }
    const module = moduleSnap.data() as ModuleDoc;
    txn.set(
      progressRef,
      {
        moduleId,
        topicId: module.topicId,
        subjectId: module.subjectId,
        status: "completed",
        startedAt: progressSnap.get("startedAt") ?? FieldValue.serverTimestamp(),
        completedAt: FieldValue.serverTimestamp()
      },
      { merge: true }
    );
    const result = applyOutcome(txn, ctx, {
      eventId,
      reason: "module_completed",
      refId: moduleId,
      xp: config.moduleXp,
      stars: 0,
      activity: { modules: 1 },
      stats: { modulesCompleted: 1 }
    });
    return { alreadyCompleted: false, ...result };
  });
});
