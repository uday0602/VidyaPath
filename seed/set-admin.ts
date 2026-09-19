// Grants the admin custom claim to an existing Auth user.
//   npm run set-admin -- user@example.com
// Emulator: set FIREBASE_AUTH_EMULATOR_HOST. Real project: GOOGLE_APPLICATION_CREDENTIALS and FIREBASE_PROJECT_ID.
import "dotenv/config";
import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore, FieldValue } from "firebase-admin/firestore";

const email = process.argv[2];
if (!email) {
  console.error("Usage: npm run set-admin -- user@example.com");
  process.exit(1);
}

if (getApps().length === 0) {
  if (process.env.FIREBASE_AUTH_EMULATOR_HOST || process.env.FIRESTORE_EMULATOR_HOST) {
    initializeApp({ projectId: process.env.FIREBASE_PROJECT_ID || "demo-vidyapath" });
  } else {
    const credentialsPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
    const projectId = process.env.FIREBASE_PROJECT_ID;
    if (!credentialsPath || !projectId) {
      console.error("Set GOOGLE_APPLICATION_CREDENTIALS and FIREBASE_PROJECT_ID in .env");
      process.exit(1);
    }
    initializeApp({ credential: cert(credentialsPath), projectId });
  }
}

const auth = getAuth();
const user = await auth.getUserByEmail(email);
await auth.setCustomUserClaims(user.uid, { admin: true });
await getFirestore().doc(`users/${user.uid}`).set({ role: "admin", updatedAt: FieldValue.serverTimestamp() }, { merge: true });
console.log(`${email} (${user.uid}) is now an admin. The user must sign out and in again for the claim to apply.`);
