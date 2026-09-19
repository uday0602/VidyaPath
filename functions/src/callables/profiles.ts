import { FieldValue } from "firebase-admin/firestore";
import { onDocumentWritten } from "firebase-functions/v2/firestore";
import { db } from "../lib/admin.js";
import { anonUsername, avatarFor } from "../lib/hash.js";
import type { UserDoc } from "../types.js";

/**
 * Keep the anonymous public profile, streak and spin state in step with the private user doc.
 * The client can create and edit its own users/{uid} (validated by rules); everything
 * derived from it is written here so nothing sensitive is ever exposed by the client.
 */
export const syncPublicProfile = onDocumentWritten("users/{uid}", async (event) => {
  const after = event.data?.after;
  if (!after?.exists) return;
  const uid = event.params.uid;
  const user = after.data() as UserDoc;
  const profileRef = db.doc(`publicProfiles/${uid}`);
  const profileSnap = await profileRef.get();
  const batch = db.batch();
  batch.set(
    profileRef,
    {
      uid,
      anonUsername: anonUsername(uid),
      avatar: avatarFor(uid),
      classLevel: user.classLevel,
      goal: user.goal,
      subjects: user.subjects ?? [],
      ...(profileSnap.exists ? {} : { level: 1, progressSummary: { accuracy: 0, questionsSolved: 0, modulesCompleted: 0 }, twinStatus: "none", twinPairId: null }),
      updatedAt: FieldValue.serverTimestamp()
    },
    { merge: true }
  );
  if (!profileSnap.exists) {
    batch.set(db.doc(`streaks/${uid}`), { uid, current: 0, longest: 0, lastQualifiedDate: null, milestonesAwarded: [], updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    batch.set(db.doc(`spinState/${uid}`), { uid, nextSpinAt: null, lastResult: null, totalSpins: 0 }, { merge: true });
  }
  await batch.commit();
});
