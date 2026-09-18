# Security

VidyaPath AI treats security as the first priority. This document describes what is protected, how, and what is still open.

## 1. Authentication

- Firebase Authentication, email and password. Session persistence is the Firebase default (local), so a refresh or browser restart keeps the student signed in.
- The app listens to `onAuthStateChanged` in `src/context/AuthContext.tsx`. Every protected route renders behind `RequireAuth` in `src/App.tsx`. A signed-in user with no profile is sent to the registration form to complete it.
- Password reset uses `sendPasswordResetEmail`.
- Admin access is a **custom claim** (`admin: true`) set with `npm run set-admin -- <email>`. The claim is read from the ID token, never from a Firestore field the client could edit.

## 2. Authorization model

Three tiers of data:

| Tier | Examples | Who reads | Who writes |
|---|---|---|---|
| Public content | subjects, chapters, topics, modules, questions (without keys), problems (without solutions), rewards, challenges, career paths, badges, app config | any signed-in user | admin claim only (seeded by the Admin SDK) |
| Private student data | users, studentProgress, quizAttempts, problemAttempts, mistakes, streaks, ledgers, claims, spin state, AI sessions, notifications, study plans, blocks, reports | owner (and admin for support cases) | see below |
| Server-only | questionKeys, problemSolutions, processedEvents, votes, all ledgers and balances | nobody from the client (keys and solutions), owner read for ledgers | Cloud Functions only |

The full per-collection matrix is in `firestore.rules`, which is the source of truth. Summary:

| Collection | Public read | Signed-in read | Owner read | Owner write | Admin write | Server-only write |
|---|---|---|---|---|---|---|
| users/{uid} | no | no | yes | name, class, board, stream, language, subjects, goal only, validated | role | xp, stars, counters, badgeIds |
| publicProfiles/{uid} | no | yes (anonymous fields only) | yes | no | no | yes |
| studentProgress/{uid}/** | no | no | yes | no | no | yes |
| quizAttempts, problemAttempts, mistakes | no | no | yes (userId) | no | no | yes |
| streaks, dailyActivity, spinState, spinHistory | no | no | yes | no | no | yes |
| xpTransactions, starsTransactions | no | no | yes | no | no | yes |
| rewardClaims | no | no | yes | no | status only | create |
| userBadges/{uid}/badges | no | no | yes | no | no | yes |
| aiSessions/{uid}/messages, aiUsage | no | no | yes | no | no | yes |
| notifications/{uid}/items | no | no | yes | `read` flag only | no | create |
| studyPlans/{uid} | no | no | yes | yes, validated ranges | no | no |
| blocks/{uid}/users | no | no | yes | create and delete | no | no |
| reports | no | no | reporter | create only, validated enum | status | no |
| doubts | no | when `hidden == false` | author (even when hidden) | author: `status` only | hidden, status | create (via Function) |
| doubts/{id}/answers | no | when `hidden == false` | author | no | hidden | create (via Function) |
| votes | no | no | yes | no | no | yes |
| studyTwins, twinChallenges | no | members only | members | no | no | yes |
| questionKeys, problemSolutions | no | no | no | no | yes | seed |
| processedEvents | no | no | no | no | no | yes |

Reasoning:

- **Balances and progress are server-only** because a client that is allowed to write its own Stars cannot be distinguished from a tampering client. The rules therefore reject every client write to those fields, and the only writer is the Admin SDK inside Cloud Functions.
- **Answer keys and worked solutions are never client-readable.** Quizzes are scored on the server. Problem solutions are returned only after a correct submission or an explicit "reveal", which disables rewards for that problem.
- **Doubts and answers are created through Functions**, not direct writes, so cooldowns, duplicate detection and block checks cannot be bypassed.
- **Public profiles are a separate collection** that carries an anonymous username, avatar id, class, goal, level and subjects. Email, real name and contact details never leave `users/{uid}`.

## 3. Server-side trusted operations

All in `functions/src/callables/`. Every function requires `request.auth`, validates input types and ranges, and runs in a Firestore transaction.

| Function | Protection |
|---|---|
| `completeModule` | idempotent on `module_{uid}_{moduleId}`; second call returns `alreadyCompleted` |
| `finalizeQuiz` | idempotent on `quiz_{uid}_{attemptId}`; XP and Stars only on the first completion of a quiz, later attempts update accuracy only |
| `submitProblemAttempt` | idempotent on attempt id; rewards only for the first correct solve and never after a reveal; level lock enforced server-side |
| `completeDailyChallenge` | one event per user per IST day; server verifies the challenge is today's |
| `spinWheel` | server checks `nextSpinAt`, picks the weighted result, writes history; event id derives from the spin counter so overlapping clicks collide |
| `claimReward` | verifies reward exists, is available, balance suffices, once-per-user; deducts atomically; `claimKey` makes retries idempotent |
| `recordStudySession` | minutes capped at 60 per call and 600 per day; idempotent on session id |
| `askAi` | daily usage cap, 20 s timeout, output validation, answer-leak check in Learning Mode, fallback |
| `postDoubt`, `postAnswer` | cooldown from server timestamps, duplicate hash check, block check, length limits |
| `voteAnswer` | one vote document per user per answer, no self-votes, counter incremented in the same transaction |
| `matchStudyTwin`, `createTwinChallenge`, `submitTwinChallenge` | membership checks; only anonymous profile fields are shared |

Shared engine (`functions/src/lib/engine.ts`): one `readUserContext` then one `applyOutcome` per event. `applyOutcome` writes the `processedEvents/{eventId}` marker, ledger rows, balance increments, daily activity, streak, badges, notifications and the public summary in the same transaction. A repeated request for the same event id is detected before any reward is computed.

## 4. Streak integrity

- Days are computed on the server in Asia/Kolkata from `Date.now()` inside the Function. The client clock is never used.
- A day qualifies only through meaningful activity (20 minutes, 10 questions, 1 module or 1 revision). Login does not count.
- Streak, longest streak, and awarded milestones are server-only fields.

## 5. AI key handling

- The Gemini key is a Functions secret (`firebase functions:secrets:set GEMINI_API_KEY`). It is never in the Vite bundle, in React code, in Firestore, or in the repo. `.env.example` contains placeholders only.
- All AI traffic goes through the `askAi` callable. The browser never talks to Google directly.
- Every response is validated (`functions/src/lib/aiValidate.ts`): empty, too short, over-long, or unsafe output is rejected. When the model is unavailable or rejected, a content-authored fallback is shown with the notice "AI service temporarily unavailable. Showing guided fallback." Fallback text is never presented as a model response.

## 6. Privacy

- Students see other students only through `publicProfiles` (anonymous username, avatar id, class, goal, level, subjects, progress summary).
- Doubts and answers carry the anonymous username, not the uid-linked name.
- No image upload, no private chat, no location data.

## 7. Moderation and abuse prevention

- Report reasons: spam, abuse, irrelevant, inappropriate, harassment, other. Reports are readable only by their reporter and admins.
- Blocking is per user (`blocks/{uid}/users/{blockedUid}`); the blocked user cannot answer the blocker's doubts, and the blocker's client hides their content.
- Admin actions (hide, restore, resolve, claim status, reward availability) are rule-enforced on the admin claim, not on UI visibility.
- Rate limits: doubt post cooldown 120 s, answer cooldown 30 s, AI 40 calls per day, study minutes capped, all configurable in `appConfig/rewards`.

## 8. Known security limitations

- **App Check is not enabled.** Callables can be invoked by any authenticated client, including scripts. Rewards are still bounded by the server-side rules above, but enabling App Check is the next step before public launch.
- **Study session minutes come from a client timer.** They are capped, but a scripted client could claim up to 60 minutes per call within the daily cap. Streak days can therefore be earned by a determined cheater at the rate of one per day, which is the same rate an honest student earns them.
- **Doubt content is not automatically screened.** Moderation is reactive (reports and admin review). A profanity or toxicity filter is future work.
- **Spin result randomness** uses `Math.random()` in the Function. It is not manipulable by the client, but it is not a cryptographic source either.
- **Rules tests require the emulator** (`npm run test:rules` inside `firebase emulators:exec`). They were written but not executed in the environment this repo was produced in; run them before deploying.
- No email verification is enforced at registration.
