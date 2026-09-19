import { setGlobalOptions } from "firebase-functions/v2";

setGlobalOptions({ region: "asia-south1", maxInstances: 10 });

export { startModule, completeModule } from "./callables/modules.js";
export { finalizeQuiz } from "./callables/quiz.js";
export { submitProblemAttempt, revealSolution } from "./callables/problems.js";
export { completeDailyChallenge } from "./callables/challenge.js";
export { spinWheel } from "./callables/spin.js";
export { claimReward } from "./callables/rewards.js";
export { recordStudySession } from "./callables/sessions.js";
export { askAi } from "./callables/askAi.js";
export { postDoubt, postAnswer, voteAnswer } from "./callables/doubts.js";
export { matchStudyTwin, createTwinChallenge, submitTwinChallenge } from "./callables/studyTwin.js";
export { syncPublicProfile } from "./callables/profiles.js";
