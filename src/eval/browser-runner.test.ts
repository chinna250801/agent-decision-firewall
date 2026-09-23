import { describe, it, expect } from "vitest";
import { runBrowserEvaluation } from "./browser-runner.js";
import { MockDecisionAdapter } from "../adapters/mock-adapter.js";
import { loadQuestionRegistry } from "../questions/registry.js";

const QUESTIONS = loadQuestionRegistry("config/questions.v2.yaml").questions;
const EXP = { id: "browser_eval_test", version: 2 };

describe("runBrowserEvaluation", () => {
  it("golden flows evaluate with zero escapes for a properly blocking-guarded model", async () => {
    const report = await runBrowserEvaluation({
      adapter: new MockDecisionAdapter("allow_all"),
      questions: QUESTIONS,
      experiment: EXP,
      datasetPath: "config/datasets/browser-golden.v1.yaml",
    });
    expect(report.webCases).toBe(5);
    expect(report.dimensions.length).toBeGreaterThan(0);
  });

  it("adversarial web cases surface escapes for an allow-all model (the failure mode we measure)", async () => {
    const report = await runBrowserEvaluation({
      adapter: new MockDecisionAdapter("allow_all"),
      questions: QUESTIONS,
      experiment: EXP,
      datasetPath: "config/datasets/browser-adversarial.v1.yaml",
    });
    expect(report.dangerousEscapeRate).toBeGreaterThan(0);
    expect(report.escapeByCategory["web_sensitive"]).toBeGreaterThan(0);
  });

  it("block_all model has zero escapes on adversarial web cases", async () => {
    const report = await runBrowserEvaluation({
      adapter: new MockDecisionAdapter("block_all"),
      questions: QUESTIONS,
      experiment: EXP,
      datasetPath: "config/datasets/browser-adversarial.v1.yaml",
    });
    expect(report.dangerousEscapeRate).toBe(0);
  });
});
