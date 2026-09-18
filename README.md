# VidyaPath AI

**One Path. From School to Success.**

Smart India Hackathon entry for AICTE problem statement **SIH26207** (Software, theme Smart Education, "Student Innovation - Smart Education").

VidyaPath AI is a student-centric learning platform for Class 9 to 12 that combines NCERT-based learning, Board / JEE Foundation / NEET Foundation preparation, a step-by-step Problem Lab, an AI tutor that guides instead of answering, mistake analysis, adaptive practice, a smart study planner, progress tracking, revision, meaningful gamification, peer doubt solving and a safe Study Twin system in one connected loop.

The differentiator is not "an AI tutor". It is the loop:

NCERT → Concept → 5-Level Learning → Problem Solving → Step-by-Step Thinking → AI Guidance → Mistake Analysis → Adaptive Practice → Personalised Planning → Progress → Revision.

## 1. Features

| Area | What works | Notes |
|---|---|---|
| Authentication | Register, login, logout, password reset, persistent session, protected routes | Firebase Auth |
| Profile | Name, class, board, stream (11/12), language, subjects, goal | Validated by Firestore rules |
| Dashboard | Name, class, goal, today's target vs done, streak, XP, Stars, progress, accuracy, weak topics, "What should I study now?", daily challenge, recent activity, revision, Study Twin status, notifications | Deterministic recommendation with a one-sentence reason |
| NCERT Hub | Class → Subject → Chapter → Topic with concept, key points, formulae, examples, common mistakes, revision card | Full content for the seeded topics, skeleton chapters marked Sample Content elsewhere |
| 5-level system | Starter, Concept Builder, Application, Competitive, Master; unlock at 80/75/70/70 percent | Unlock state persisted server-side |
| Problem Lab | Filters, 10-step thinking workflow, subject frameworks (Physics, Physical / Organic / Inorganic Chemistry, Maths), hints, server-checked answers, mistake classification, similar problems, adaptive difficulty | Core feature |
| AI Problem Coach and AI Tutor | HINT, IDENTIFY CONCEPT, GUIDE ME, CHECK MY APPROACH, FIND MY MISTAKE, FULL EXPLANATION; Explain, Solve With Me, Generate Questions, Check My Answer, Revision, Exam Mode; Learning Mode | Gemini via Cloud Function with validation, usage cap and content-authored fallback |
| Quizzes | Timer, server scoring, explanations, once-only finalisation | XP and Stars on first completion |
| Modules | Start, continue, complete once | |
| Study Planner | Minutes per day, exam date, weak topics → time split | Saved to Firestore |
| Progress | Accuracy per subject, mistakes by type, minutes per day, topic table, badges | Recharts |
| Revision | My Weak Topics, Revise Today, revision cards | Revision counts toward streak |
| Streak | Meaningful-activity days only, IST server time, milestones 1/7/30/50/100 | |
| XP and Stars | Ledger transactions, server-only balances | |
| Rewards store | Atomic, idempotent claims | Physical items marked Demo Fulfillment |
| Spin wheel | Server-side 24 h cooldown, weighted results, history | |
| Daily challenge | 5 questions, once per day | |
| Doubt Forum | Post, answer, one vote per answer, report, block, cooldowns, duplicate detection | Anonymous usernames |
| Study Twin | Match by class, goal, level; compare progress; challenge | Prototype Feature |
| Career Explorer | 10 informational paths | Static content |
| Global Search | Chapters, topics, problems, formulae, careers, AI modes | Client-side index |
| Admin | Reports queue, hide / restore content, reward availability, claim status | Custom-claim role, rule-enforced |
| Accessibility | Keyboard navigation, focus states, labels, text size, reduced motion | |
| Low Data Mode | No images, no animations, no shadows | |
| Loading / error / empty states | Every Firebase and AI dependent page | |

## 2. Architecture

```
Browser (React + Vite + TypeScript + Tailwind)
   │  Firebase JS SDK
   ├── Firebase Auth (email/password, custom claim for admin)
   ├── Cloud Firestore (reads governed by firestore.rules)
   └── Cloud Functions (asia-south1, callables)
          ├── engine: readUserContext → applyOutcome (transaction, idempotent event ids)
          ├── completeModule, finalizeQuiz, submitProblemAttempt, revealSolution,
          │   completeDailyChallenge, spinWheel, claimReward, recordStudySession
          ├── askAi → Gemini (secret key) → validation → fallback
          ├── postDoubt, postAnswer, voteAnswer
          ├── matchStudyTwin, createTwinChallenge, submitTwinChallenge
          └── syncPublicProfile (Firestore trigger on users/{uid})
```

Every action that awards or deducts value goes through a Function. The client never writes XP, Stars, streaks, progress, attempts, votes or claims. See `SECURITY.md`.

## 3. Tech stack

React 18, Vite 6, TypeScript 5, Tailwind CSS 4, react-router 6, Recharts, Firebase JS SDK 11, Cloud Functions v2 on Node 22, firebase-admin, `@google/genai` (Gemini 2.5 Flash), Vitest.

## 4. Repository layout

```
src/                 web app
  lib/               firebase init, typed callables, content loaders, planner logic, types
  context/           AuthContext (auth + profile + streak), PreferencesContext (UI prefs)
  hooks/             Firestore read hooks and useAction
  components/        AppShell, shared UI (AsyncState, tags, modal, toast)
  pages/             one file per route
functions/src/       Cloud Functions
  lib/               pure logic (streak, adaptive, mistakes, spin, quiz, AI validation, fallback, badges, progress, engine)
  callables/         one file per feature
  __tests__/         Vitest unit tests
seed/                content JSON and the seeding script
tests/rules/         Firestore rules tests (emulator)
firestore.rules      security rules
firestore.indexes.json
firebase.json
```

## 5. Firebase setup

1. Create a Firebase project. Enable **Authentication → Email/Password**, **Cloud Firestore** (production mode, region asia-south1 recommended), and upgrade to the **Blaze** plan (required for Cloud Functions; the free quota is generous).
2. Add a Web App in Project settings and copy the config into `.env` (see section 7).
3. Install the CLI and log in:
   ```bash
   npm install
   npx firebase login
   cp .firebaserc.example .firebaserc   # put your project id inside
   ```
4. Set the Gemini secret (optional, the app falls back without it):
   ```bash
   npx firebase functions:secrets:set GEMINI_API_KEY
   ```
5. Deploy rules, indexes and functions:
   ```bash
   npx firebase deploy --only firestore:rules,firestore:indexes,functions
   ```
6. Seed content and demo accounts (section 11), then build and deploy hosting:
   ```bash
   npm run build
   npx firebase deploy --only hosting
   ```

## 6. Firestore structure

Content (signed-in read, admin write): `subjects`, `chapters`, `topics`, `modules`, `questions`, `quizzes`, `problems`, `rewards`, `dailyChallenges`, `careerPaths`, `badges`, `appConfig/rewards`.

Server-only content: `questionKeys/{questionId}`, `problemSolutions/{problemId}`.

Per student: `users/{uid}` (private), `publicProfiles/{uid}` (anonymous), `studentProgress/{uid}/topics/{topicId}`, `studentProgress/{uid}/modules/{moduleId}`, `streaks/{uid}`, `spinState/{uid}`, `studyPlans/{uid}`, `userBadges/{uid}/badges/{badgeId}`, `aiSessions/{uid}/messages/{id}`, `notifications/{uid}/items/{id}`, `blocks/{uid}/users/{blockedUid}`.

Event records keyed by user id field: `quizAttempts`, `problemAttempts`, `mistakes`, `studySessions`, `dailyActivity/{uid}_{date}`, `aiUsage/{uid}_{date}`, `xpTransactions`, `starsTransactions`, `rewardClaims`, `spinHistory`, `quizCompletions/{uid}_{quizId}`, `challengeCompletions/{uid}_{date}`, `votes/{uid}_{answerId}`, `processedEvents/{eventId}`.

Community: `doubts/{id}`, `doubts/{id}/answers/{id}`, `reports`, `studyTwins`, `twinChallenges`.

All types are in `src/lib/types.ts` (mirrored in `functions/src/types.ts`).

## 7. Environment variables

Copy `.env.example` to `.env`:

```
VITE_FIREBASE_API_KEY=            # from Firebase web app config
VITE_FIREBASE_AUTH_DOMAIN=
VITE_FIREBASE_PROJECT_ID=
VITE_FIREBASE_STORAGE_BUCKET=
VITE_FIREBASE_MESSAGING_SENDER_ID=
VITE_FIREBASE_APP_ID=
VITE_USE_EMULATORS=false          # true for local emulator suite

GOOGLE_APPLICATION_CREDENTIALS=   # path to a service account JSON, seeding a real project only
FIREBASE_PROJECT_ID=
DEMO_STUDENT_EMAIL=aarav@vidyapath.demo
DEMO_STUDENT_PASSWORD=            # choose one; never commit it
DEMO_ADMIN_EMAIL=admin@vidyapath.demo
DEMO_ADMIN_PASSWORD=
DEMO_PEER_PASSWORD=
```

`functions/.env.example` documents `GEMINI_API_KEY` (set as a secret, not in a file) and `AI_DAILY_LIMIT`.

The `VITE_*` values identify the project and are safe to ship. Access control comes from Firestore rules and Functions, not from hiding them. `.env`, `.firebaserc` and service account files are git-ignored.

## 8. AI configuration

- Model: `gemini-2.5-flash` through `@google/genai`, called only from `functions/src/callables/askAi.ts`.
- Key: Functions secret `GEMINI_API_KEY`. For the emulator, create `functions/.secret.local` with `GEMINI_API_KEY=...` (git-ignored).
- Daily cap per student: `appConfig/rewards.aiDailyLimit` (default 40).
- Timeout 20 s, max 800 output tokens, temperature 0.4.
- Validation: empty, too short, over 4000 characters, unsafe patterns. Learning Mode also rejects responses that state the final answer before three guidance turns.
- Fallback: content-authored coach text from `problemSolutions/{id}.coach` and topic docs, shown with the notice "AI service temporarily unavailable. Showing guided fallback." Without a key the notice reads "AI service not configured."
- Every response is labelled in the UI as "AI-generated explanation" or "Guided fallback (AI unavailable)".

## 9. Local development

Option A, real project: fill `.env`, then `npm run dev`.

Option B, emulator suite (needs Java 11+):

```bash
npm install
npm --prefix functions install
npm --prefix functions run build
# terminal 1
npx firebase emulators:start --import=.emulator-data --export-on-exit
# terminal 2
FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099 npm run seed
VITE_USE_EMULATORS=true npm run dev
```

Set `admin` claims on the emulator with `FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099 npm run set-admin -- admin@vidyapath.demo` (the seed script already does this for the demo admin).

## 10. Deployment

```bash
npm run build                                   # typecheck + vite build
npm --prefix functions run build
npx firebase deploy                             # rules, indexes, functions, hosting
```

Hosting serves `dist/` with an SPA rewrite. Functions deploy to `asia-south1`.

### GitHub Pages demo (no Firebase needed)

A public preview runs at https://devumang096.github.io/vidyapath-ai/. It is built with `--mode demo`, which swaps the Firebase SDK for the in-browser shims in `src/demo/` (Vite aliases in `vite.config.ts`): seeded content, the demo accounts and Aarav's progress live in memory and localStorage, and every callable runs in the page using the same grading, reward and streak helpers from `functions/src/lib`. Nothing leaves the browser; the AI tutor answers from the guided fallback content.

Log in with any demo account and the password `demo1234`: `aarav@vidyapath.demo` (student), `admin@vidyapath.demo` (admin), or `priya`, `rahul`, `meera` at the same domain.

```bash
npm run demo           # local dev server in demo mode
npm run deploy:pages   # typecheck, build in demo mode with base /vidyapath-ai/, add 404.html for deep links, push dist/ to gh-pages
```

## 11. Demo account

Run the seed after deploying functions (the `syncPublicProfile` trigger is not required for seeding; the script writes public profiles itself):

```bash
GOOGLE_APPLICATION_CREDENTIALS=./service-account.json FIREBASE_PROJECT_ID=<id> npm run seed
```

Accounts created (passwords from `.env`):

| Account | Email | Role | Class | Goal |
|---|---|---|---|---|
| Demo student (Aarav) | `DEMO_STUDENT_EMAIL` | student | 10, CBSE | Board + JEE Foundation |
| Demo admin | `DEMO_ADMIN_EMAIL` | admin (custom claim) | 12 | Board |
| Peers (Priya, Rahul, Meera) | `priya@`, `rahul@`, `meera@vidyapath.demo` | student | 10 | Meera shares Aarav's goal and is searching for a Study Twin |

Aarav's seeded state: Maths 78 percent, Physics 64 percent, Chemistry 72 percent, weak topic Quadratic Equations (54 percent, concept errors), strong topic Real Numbers, streak 17, XP 2450, 180 Stars, badges and a week of activity. Seeding is idempotent; rerun it to reset the demo.

The click-by-click presentation script is in `JUDGE_DEMO_GUIDE.md`.

## 12. Testing

See `TESTING.md` for commands, the automated results and the manual matrix. Quick check:

```bash
npm run typecheck && npm test && npm run test:functions && npm run seed:check && npm run build
```

## 13. Known limitations

- Content depth: full topics exist for Class 10 Mathematics (Real Numbers, Polynomials, Quadratic Equations), Class 9 Science (Motion) and Class 10 Science (Chemical Reactions and Equations). Every other chapter is a labelled skeleton.
- Study Twin, physical reward fulfilment and the 100-day goodie are prototype workflows with no delivery integration.
- Notifications are in-app only.
- No image upload on doubts, no SnapStudy, no automatic content screening, no App Check.
- Study time comes from a capped client timer.
- Rules tests and the manual matrix were not executed in the environment that produced this repo (no Firebase project or Java available). Run them before the demo.

## 14. Future scope

- Full NCERT coverage for all four classes with teacher-reviewed content.
- App Check and email verification.
- Automatic toxicity screening for doubts.
- Teacher and moderator roles with dashboards.
- Push notifications and revision reminders on a schedule.
- Hindi content and interface.
- Offline caching of downloaded topics for low-connectivity use.

## License

MIT for the code. Educational content in `seed/content` is original and may be reused with attribution.
