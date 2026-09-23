import { describe, it, expect } from "vitest";
import { binaryMetrics, brierScore, expectedCalibrationError, dimensionReports } from "./metrics.js";
import { runEvaluation } from "./runner.js";
import { MockDecisionAdapter } from "../adapters/mock-adapter.js";
import { loadQuestionRegistry } from "../questions/registry.js";
import { loadDataset } from "../datasets/load.js";

describe("binary metrics math", () => {
  it("computes precision/recall/F1 and error rates", () => {
    const m = binaryMetrics([
      { predicted: true, actual: true, score: 0.9 },
      { predicted: true, actual: false, score: 0.8 },
      { predicted: false, actual: true, score: 0.2 },
      { predicted: false, actual: false, score: 0.1 },
    ]);
    expect(m.accuracy).toBe(0.5);
    expect(m.precision).toBeCloseTo(0.5);
    expect(m.recall).toBeCloseTo(0.5);
    expect(m.f1).toBeCloseTo(0.5);
    expect(m.falsePositiveRate).toBeCloseTo(0.5);
  });

  it("scores perfect predictions with zero Brier and low ECE", () => {
    const preds = [true, false, true, false].map((a) => ({ score: a ? 0.99 : 0.01, actual: a }));
    expect(brierScore(preds)).toBeLessThan(0.01);
    expect(expectedCalibrationError(preds)).toBeLessThan(0.05);
  });

  it("penalizes confident wrong answers in Brier", () => {
    const preds = [true].map((a) => ({ score: 0.01, actual: a }));
    expect(brierScore(preds)).toBeGreaterThan(0.9);
  });
});

describe("runEvaluation (mock adapter, golden dataset)", () => {
  const questions = loadQuestionRegistry("config/questions.v1.yaml").questions;

  it("produces a full report with security-critical rates", async () => {
    const report = await runEvaluation({
      adapter: new MockDecisionAdapter("allow_all"),
      questions,
      experiment: { id: "test", version: 1 },
      cases: loadDataset("config/datasets/golden.v1.yaml"),
    });
    expect(report.datasetSize).toBeGreaterThan(10);
    expect(report.dangerousEscapeRate).toBeGreaterThan(0.5); // allow_all lets everything through — that IS the failure mode we measure
    expect(report.dimensions.length).toBe(7);
    expect(report.outcomes.every((o) => o.caseId.startsWith("case_"))).toBe(true);
  });

  it("dimension reports collect per-question stats", () => {
    const reports = dimensionReports([
      {
        result: {
          model: "m", modelVersion: null, latencyMs: 1, tokens: null, rawResponse: {}, error: null,
          answers: {
            destructive: { questionId: "destructive", questionVersion: 1, type: "noul", value: 0.9 },
          },
        },
        expected: { destructive: true },
      },
      {
        result: {
          model: "m", modelVersion: null, latencyMs: 1, tokens: null, rawResponse: {}, error: null,
          answers: {
            destructive: { questionId: "destructive", questionVersion: 1, type: "noul", value: 0.1 },
          },
        },
        expected: { destructive: false },
      },
    ]);
    const d = reports.find((r) => r.questionId === "destructive")!;
    expect(d.metrics.accuracy).toBe(1);
    expect(d.brier).toBeLessThan(0.05);
  });
});
