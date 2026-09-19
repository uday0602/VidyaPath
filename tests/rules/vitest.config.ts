import { defineConfig } from "vitest/config";

// Runs only against the Firestore emulator: `firebase emulators:exec --only firestore "npm run test:rules"`
export default defineConfig({
  test: {
    include: ["tests/rules/**/*.test.ts"],
    testTimeout: 20_000,
    hookTimeout: 20_000
  }
});
