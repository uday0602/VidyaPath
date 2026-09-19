import { describe, expect, it } from "vitest";
import { allocateStudyTime, recommendNext, weakTopics, type TopicSummary } from "../planner";

describe("allocateStudyTime", () => {
  it("always sums to the available minutes", () => {
    for (const minutes of [15, 60, 120, 240, 713]) {
      const allocation = allocateStudyTime({ minutesPerDay: minutes, daysToExam: null, weakTopicCount: 0, pendingModuleCount: 0 });
      expect(Object.values(allocation).reduce((sum, value) => sum + value, 0)).toBe(minutes);
    }
  });
  it("shifts toward revision and problems near an exam", () => {
    const far = allocateStudyTime({ minutesPerDay: 120, daysToExam: 200, weakTopicCount: 0, pendingModuleCount: 0 });
    const near = allocateStudyTime({ minutesPerDay: 120, daysToExam: 10, weakTopicCount: 0, pendingModuleCount: 0 });
    expect(near.revision).toBeGreaterThan(far.revision);
    expect(near.learning).toBeLessThan(far.learning);
  });
});

const topic = (overrides: Partial<TopicSummary>): TopicSummary => ({
  topicId: "t", topicName: "Quadratic Equations", subjectName: "Mathematics", accuracy: 90, attempts: 10, mainMistake: null, levelUnlocked: 2, lastPracticedAt: new Date(), ...overrides
});

describe("recommendNext", () => {
  it("picks the weakest topic with a reason that quotes accuracy", () => {
    const recommendation = recommendNext([topic({ accuracy: 54, mainMistake: "concept" }), topic({ topicId: "u", topicName: "Real Numbers", accuracy: 92 })], null, false);
    expect(recommendation.kind).toBe("revise");
    expect(recommendation.reason).toContain("54%");
    expect(recommendation.reason).toContain("Concept Error");
  });
  it("ignores topics with too few attempts", () => {
    expect(weakTopics([topic({ accuracy: 10, attempts: 2 })])).toHaveLength(0);
  });
  it("falls back to a pending module, then to the challenge", () => {
    expect(recommendNext([], { moduleId: "m1", title: "Intro" }, false).kind).toBe("learn");
    expect(recommendNext([], null, false).kind).toBe("challenge");
  });
});
