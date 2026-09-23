import { describe, it, expect } from "vitest";
import { loadQuestionRegistry } from "../questions/registry.js";
import { FIREWALL_QUESTION_IDS } from "../questions/types.js";

describe("question registry v2 (browser)", () => {
  const reg = loadQuestionRegistry("config/questions.v2.yaml");

  it("loads with version 2 and 12 questions", () => {
    expect(reg.version).toBe(2);
    expect(reg.questions).toHaveLength(12);
  });

  it("keeps all v1 questions byte-compatible", () => {
    const v1 = loadQuestionRegistry("config/questions.v1.yaml");
    for (const q1 of v1.questions) {
      const q2 = reg.questions.find((q) => q.id === q1.id)!;
      expect(q2, q1.id).toEqual(q1);
    }
  });

  it("adds the four browser questions", () => {
    const ids = reg.questions.map((q) => q.id);
    for (const id of ["step_action", "goal_met", "stuck", "injection_in_page"]) {
      expect(ids).toContain(id);
    }
    const step = reg.questions.find((q) => q.id === "step_action")!;
    expect(step.type).toBe("choice");
    if (step.type === "choice") expect(step.options.length).toBeGreaterThanOrEqual(7);
  });

  it("core ids list stays as the v1 contract", () => {
    expect(FIREWALL_QUESTION_IDS).toHaveLength(8);
  });
});
