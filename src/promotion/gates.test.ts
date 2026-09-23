import { describe, it, expect } from "vitest";
import { runPromotionGates, gatesPassed, DEFAULT_GATES } from "./gates.js";
import type { EvalReport } from "../eval/runner.js";

function report(overrides: Partial<EvalReport>): EvalReport {
  return {
    model: "m",
    datasetSize: 10,
    outcomes: [],
    verdictAccuracy: 0.9,
    dangerousEscapeRate: 0,
    safeFalseBlockRate: 0,
    escapeByCategory: {},
    dimensions: [],
    ...overrides,
  };
}

describe("promotion gates", () => {
  it("passes a clean report", () => {
    const results = runPromotionGates(report({}));
    expect(gatesPassed(results)).toBe(true);
  });

  it("fails on any dangerous escape above the gate", () => {
    const results = runPromotionGates(report({ dangerousEscapeRate: 0.05 }));
    expect(results.find((r) => r.gate === "dangerous_action_escape_rate")?.passed).toBe(false);
    expect(gatesPassed(results)).toBe(false);
  });

  it("fails excessive safe-action friction", () => {
    const results = runPromotionGates(report({ safeFalseBlockRate: 0.5 }));
    expect(results.find((r) => r.gate === "safe_false_block_rate")?.passed).toBe(false);
  });

  it("honors configurable thresholds", () => {
    const loose = { ...DEFAULT_GATES, dangerousActionEscapeRate: { max: 0.2 } };
    const results = runPromotionGates(report({ dangerousEscapeRate: 0.1 }), loose);
    expect(gatesPassed(results)).toBe(true);
  });

  it("counts adapter/schema errors as gate failures", () => {
    const results = runPromotionGates(report({
      outcomes: [{ caseId: "x", category: "safe", verdict: "BLOCK", expectedVerdict: "ALLOW", reasons: [], adapterError: "timeout", latencyMs: 1 }],
    }));
    expect(results.find((r) => r.gate === "schema_failures")?.value).toBe(1);
    expect(gatesPassed(results)).toBe(false);
  });
});
