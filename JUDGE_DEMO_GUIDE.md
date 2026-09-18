# Judge Demo Guide (4 to 5 minutes)

Prepare before the session: seed the project (`npm run seed`), open the app in a fresh browser window, and keep a second private window ready for the multi-device moment. Demo credentials are in your local `.env` (`DEMO_STUDENT_EMAIL`, `DEMO_STUDENT_PASSWORD`). Never show the `.env` file on screen.

Say once at the start: "Everything you see writes to Firebase through secured Cloud Functions. Nothing is stored only in the browser."

| # | Click | Say | Time |
|---|---|---|---|
| 1 | Landing page, then **Log in** with the demo account (Aarav, Class 10, CBSE, Board + JEE Foundation) | "Real Firebase Authentication. Firestore rules deny everything a student should not touch." | 0:15 |
| 2 | **Dashboard** loads | "Personalised: streak 17, XP 2450, weak topic Quadratic Equations, today's target vs done, Study Twin status." | 0:30 |
| 3 | Click **What should I study now?** | "One deterministic recommendation with the reason: recent accuracy 54 percent, main issue concept error." | 0:45 |
| 4 | Point at the weak topic card | "Weakness detection comes from stored mistake classification, not from a static label." | 0:55 |
| 5 | Follow the link into the **NCERT topic** Quadratic Equations | "Concept, key points, formulae, examples, common mistakes, 5-level ladder. Level 2 is unlocked because Level 1 accuracy passed 80 percent." | 1:10 |
| 6 | Open **Problem Lab** from the sidebar | "This is the core engine. Students learn how to approach a problem, not just the answer." | 1:20 |
| 7 | Filter **Mathematics, Quadratic Equations, Level 2** | "Locked levels stay locked on the server too." | 1:30 |
| 8 | Open a Level 2 problem, walk the stepper: Understand, Given, Find, Concept, Method | "Step-by-step thinking framework per subject." | 1:55 |
| 9 | Type an intentional wrong final answer and **Submit** | "The server checks against a solution the browser can never read." | 2:05 |
| 10 | Show the red banner: **Mistake classification** | "Classified as a concept or calculation error and stored under mistakes for the weakness dashboard." | 2:15 |
| 11 | Click **FIND MY MISTAKE** in the AI coach (Learning Mode ON) | "Gemini through a Cloud Function, key server-side, daily cap, output validated. If the API is down you see the guided fallback, clearly labelled." | 2:35 |
| 12 | Read the guidance out loud in one sentence | "It does not give the answer in Learning Mode. It asks for the next step." | 2:45 |
| 13 | Enter the correct answer, submit, click **Try a Similar Problem** | "First correct solve pays XP and Stars once. Solving again never double pays." | 3:00 |
| 14 | Go to **Progress** | "Accuracy per subject, mistakes by type, minutes per day, all from Firestore." | 3:10 |
| 15 | Open **Study Planner** | "120 minutes a day splits into learning, problems, revision, quiz, AI and a break, tilted by exam date and weak topics." | 3:25 |
| 16 | Point at the recommended split | "Saved to the student's plan document with validated ranges." | 3:30 |
| 17 | Open **Challenges**, answer the 5 questions, submit | "One completion per day per student, enforced by the event id on the server." | 3:55 |
| 18 | Point at the toast and header counters | "XP, Stars and streak updated in the same transaction." | 4:00 |
| 19 | Open **Rewards** | "Store claims deduct Stars atomically with an idempotency key. Physical items are marked Demo Fulfillment." | 4:10 |
| 20 | Show the **Spin Wheel** countdown | "Cooldown lives in Firestore, set by the server. Refreshing or editing the browser does nothing." | 4:20 |
| 21 | Open **Doubt Forum** | "Anonymous usernames, cooldowns, duplicate detection, one vote per answer, report and block." | 4:30 |
| 22 | Upvote an answer, then click it again | "Second vote is rejected on the server." | 4:38 |
| 23 | Open **Study Twin** | "Prototype peer matching: same class and goal, anonymous profile only, no chat, compare progress and challenge." | 4:48 |
| 24 | Back to **Dashboard** | "Progress, streak and next best action all updated. One path from school to success." | 5:00 |

Optional if time allows: open the second private window, log in as the same student, and show that the completed challenge and updated Stars are already there.

If asked "what is real and what is prototype": everything in this list writes to Firestore through Functions. Prototype labels are on Study Twin, physical reward fulfilment, and the 100-day goodie. Content beyond the seeded chapters is labelled Sample Content.
