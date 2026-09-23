import { describe, it, expect } from "vitest";
import { applyPolicy, POLICY_VERSION } from "./policy.js";
import type { Answer, DecisionResult } from "../adapters/types.js";

function result(answers: Record<string, number | { choice: string; confidence: number }>, error: DecisionResult["error"] = null): DecisionResult {
  const mapped: Record<string, Answer> = {};
  for (const [id, v] of Object.entries(answers)) {
    mapped[id] =
      typeof v === "number"
        ? { questionId: id, questionVersion: 1, type: "noul" as const, value: v }
        : { questionId: id, questionVersion: 1, type: "choice" as const, choice: v.choice, confidence: v.confidence };
  }
  return {
    model: "test",
    modelVersion: null,
    answers: mapped,
    latencyMs: 1,
    tokens: null,
    rawResponse: {},
    error,
  };
}

const SAFE = {
  authorized: 0.97,
  scope_compliant: 0.94,
  destructive: 0.02,
  sensitive: 0.01,
  suspicious: 0.03,
  reversible: 0.96,
  requires_confirmation: 0.07,
  risk: 1,
};

describe("applyPolicy", () => {
  it("allows a clean safe action", () => {
    const out = applyPolicy(result(SAFE));
    expect(out.verdict).toBe("ALLOW");
    expect(out.policyVersion).toBe(POLICY_VERSION);
  });

  it("blocks on destructive, sensitive, or suspicious", () => {
    for (const id of ["destructive", "sensitive", "suspicious"]) {
      const out = applyPolicy(result({ ...SAFE, [id]: 0.9 }));
      expect(out.verdict).toBe("BLOCK");
      expect(out.reasons).toContain(id);
    }
  });

  it("blocks when unauthorized or out of scope", () => {
    expect(applyPolicy(result({ ...SAFE, authorized: 0.1 })).verdict).toBe("BLOCK");
    expect(applyPolicy(result({ ...SAFE, scope_compliant: 0.2 })).verdict).toBe("BLOCK");
  });

  it("asks on uncertainty between thresholds", () => {
    const out = applyPolicy(result({ ...SAFE, authorized: 0.5 }));
    expect(out.verdict).toBe("ASK");
    expect(out.reasons).toContain("uncertain:authorized");
  });

  it("asks at high risk and blocks at critical risk", () => {
    expect(applyPolicy(result({ ...SAFE, risk: 3 })).verdict).toBe("ASK");
    expect(applyPolicy(result({ ...SAFE, risk: 4 })).verdict).toBe("BLOCK");
  });

  it("asks when confirmation is required", () => {
    expect(applyPolicy(result({ ...SAFE, requires_confirmation: 0.9 })).verdict).toBe("ASK");
  });

  it("fails closed on any adapter error", () => {
    const out = applyPolicy(result({}, { kind: "unavailable", message: "down" }));
    expect(out.verdict).toBe("BLOCK");
    expect(out.reasons).toEqual(["adapter_error:unavailable"]);
  });
});
