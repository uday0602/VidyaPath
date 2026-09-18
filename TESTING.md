# Testing

## How to run

| Suite | Command | Needs |
|---|---|---|
| Cloud Functions unit tests (streak, adaptive, mistakes, spin, quiz, AI validation, fallback, badges, progress, ledger engine) | `npm run test:functions` | nothing |
| Frontend logic tests (planner allocation, recommendation) | `npm test` | nothing |
| TypeScript, both packages | `npm run typecheck` and `npm --prefix functions run build` | nothing |
| Production build | `npm run build` | nothing |
| Seed data integrity | `npm run seed:check` | nothing |
| Firestore rules tests (spec section 54) | `firebase emulators:exec --only firestore "npm run test:rules"` | Java 11+, Firebase CLI |
| Manual matrix below | run app against emulators or a real project | Firebase project or emulator suite |

## Status of this snapshot

The automated suites in the first six rows were run in the environment that produced this repository and pass. The rules tests and the manual matrix were **not run** there: no Firebase project, no Java, and no Gemini key were available. Every row below marked "Not run in build environment" is honest about that. Run them on a team machine before the demo and fill in the "Actual result" column.

## Automated results

| Suite | Tests | Result |
|---|---|---|
| functions: logic.test.ts | 28 | pass |
| functions: engine.test.ts | 5 | pass |
| src: planner.test.ts | 5 | pass |
| typecheck root and functions | | pass |
| vite build | | pass |
| seed --check | | pass |

## Manual test matrix

Legend for Status: pass / fail / Not run in build environment.

### Authentication

| Test | Expected result | Actual result | Status |
|---|---|---|---|
| Register with valid data | Auth user created, users/{uid} written with role student and zero balances, redirected to dashboard | | Not run in build environment |
| Register with class 13 or role admin (devtools) | Firestore rejects the write | | Not run in build environment |
| Login with wrong password | Friendly error, no crash | | Not run in build environment |
| Logout and login | Same profile, XP, Stars, streak | | Not run in build environment |
| Password reset | Email sent message | | Not run in build environment |
| Open /dashboard signed out | Redirect to /login | | Not run in build environment |
| Open /admin as student | Redirect to /dashboard; direct Firestore admin writes rejected | | Not run in build environment |

### Dashboard

| Test | Expected result | Actual result | Status |
|---|---|---|---|
| Fresh account | Empty states, CTA suggests Daily Challenge | | Not run in build environment |
| Demo account | Name, class, goal, streak 17, XP 2450, weak topic Quadratic Equations, recommendation quoting 54% | | Not run in build environment |
| Network offline | Error state with retry, no blank screen | | Not run in build environment |

### Learning

| Test | Expected result | Actual result | Status |
|---|---|---|---|
| Open a module | startModule creates a started record | | Not run in build environment |
| Complete a module | XP awarded once, module completed, streak day qualifies | | Not run in build environment |
| Complete the same module again (refresh, click again) | alreadyCompleted, no XP | | Not run in build environment |
| Refresh, relogin, other device | Module still completed | | Not run in build environment |

### Quiz

| Test | Expected result | Actual result | Status |
|---|---|---|---|
| Questions load, timer runs | Yes | | Not run in build environment |
| Submit | Score, explanations, XP + Stars on first completion | | Not run in build environment |
| Submit twice (double click, retry) | Second call returns alreadyFinalized, no extra rewards | | Not run in build environment |
| Retake the quiz | Accuracy updates, no XP or Stars | | Not run in build environment |
| Read questionKeys from client | Permission denied | | Not run in build environment |

### Problem Lab

| Test | Expected result | Actual result | Status |
|---|---|---|---|
| Open a locked level problem | Locked message; submitProblemAttempt rejects | | Not run in build environment |
| Wrong answer 75 on the motion sample | Mistake classified Formula Selection Error | | Not run in build environment |
| Wrong answer -20 | Sign Convention Error | | Not run in build environment |
| Correct answer 20 m/s | Solution revealed, XP + Stars, similar problem offered | | Not run in build environment |
| Solve again | Correct, no rewards (already solved) | | Not run in build environment |
| Reveal then solve | Correct, no rewards | | Not run in build environment |
| Two correct in a row | suggestedLevel rises by one | | Not run in build environment |

### Rewards, Stars, XP

| Test | Expected result | Actual result | Status |
|---|---|---|---|
| Claim with enough Stars | Stars deducted once, claim pending | | Not run in build environment |
| Claim with insufficient Stars | Server error "need N more Stars", nothing deducted | | Not run in build environment |
| Claim again with same claimKey | alreadyClaimed, no second deduction | | Not run in build environment |
| Claim once-per-user reward twice | already-exists error | | Not run in build environment |
| Set stars via devtools | Permission denied | | Not run in build environment |

### Streak

| Test | Expected result | Actual result | Status |
|---|---|---|---|
| Login only | Streak unchanged | | Not run in build environment |
| 20 minutes or 10 questions or 1 module or 1 revision | Day qualifies, streak +1 | | Not run in build environment |
| Second qualifying action same day | No further increment | | Not run in build environment |
| Change device date | No effect (server time) | | Not run in build environment |
| Milestone 7 | Badge and notification once | | Not run in build environment |

### Spin wheel

| Test | Expected result | Actual result | Status |
|---|---|---|---|
| Eligible spin | Result, reward applied, nextSpinAt 24 h ahead | | Not run in build environment |
| Double click | Second request rejected (already-exists or failed-precondition) | | Not run in build environment |
| Refresh during cooldown | Countdown persists from server timestamp | | Not run in build environment |
| Edit spinState from client | Permission denied | | Not run in build environment |

### AI

| Test | Expected result | Actual result | Status |
|---|---|---|---|
| No key configured | Guided fallback with the notice, labelled | | Not run in build environment |
| Key configured | Real Gemini answer labelled "AI-generated explanation" | | Not run in build environment |
| Learning Mode ON, ask FULL EXPLANATION first | Hint instead of the answer | | Not run in build environment |
| 41st call in a day | resource-exhausted message | | Not run in build environment |
| Timeout or API failure | Fallback shown, error logged | | Not run in build environment |

### Doubts

| Test | Expected result | Actual result | Status |
|---|---|---|---|
| Post doubt | Appears in list with anonymous author | | Not run in build environment |
| Post the same doubt again | already-exists error | | Not run in build environment |
| Post within 120 s | Cooldown message | | Not run in build environment |
| Upvote | Count +1, button disabled | | Not run in build environment |
| Upvote again or self-vote | Rejected | | Not run in build environment |
| Report | Report doc created, visible in admin | | Not run in build environment |
| Block | Their content hidden; they cannot answer your doubts | | Not run in build environment |

### Study Twin (prototype)

| Test | Expected result | Actual result | Status |
|---|---|---|---|
| Match with seeded searching peer | Pair created, both profiles matched | | Not run in build environment |
| Partner profile | Only anonymous fields visible | | Not run in build environment |
| Challenge | 5 questions, results per member | | Not run in build environment |

### Persistence and multi-device

| Test | Expected result | Actual result | Status |
|---|---|---|---|
| Device A completes module, device B logs in | Completed on B | | Not run in build environment |
| Device A earns Stars, device B refreshes | Balance updated (live listener on users doc) | | Not run in build environment |
| Cross-user read of users/{other} | Permission denied | | Not run in build environment |
