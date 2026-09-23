import { describe, it, expect } from "vitest";
import { MockDecisionAdapter } from "./mock-adapter.js";

const QUESTIONS = [
  { id: "authorized", version: 1, type: "noul" as const },
  { id: "destructive", version: 1, type: "noul" as const },
  { id: "requires_confirmation", version: 1, type: "noul" as const },
  { id: "risk", version: 1, type: "score" as const },
];

describe("MockDecisionAdapter", () => {
  it("allow_all: safe noul high, danger noul low, risk low", async () => {
    const res = await new MockDecisionAdapter("allow_all").evaluate({}, QUESTIONS);
    expect(res.error).toBeNull();
    expect(res.answers["authorized"]?.value).toBeGreaterThan(0.9);
    expect(res.answers["destructive"]?.value).toBeLessThan(0.1);
    expect(res.answers["risk"]?.value).toBeLessThanOrEqual(2);
  });

  it("block_all: danger noul high, risk critical", async () => {
    const res = await new MockDecisionAdapter("block_all").evaluate({}, QUESTIONS);
    expect(res.answers["destructive"]?.value).toBeGreaterThan(0.9);
    expect(res.answers["risk"]?.value).toBe(4);
  });

  it("confirm_all: requires_confirmation high", async () => {
    const res = await new MockDecisionAdapter("confirm_all").evaluate({}, QUESTIONS);
    expect(res.answers["requires_confirmation"]?.value).toBeGreaterThan(0.8);
  });

  it("error mode returns error-as-data, never throws", async () => {
    const res = await new MockDecisionAdapter("error").evaluate({}, QUESTIONS);
    expect(res.error?.kind).toBe("unavailable");
    expect(Object.keys(res.answers)).toHaveLength(0);
  });

  it("is deterministic across runs", async () => {
    const a = await new MockDecisionAdapter("allow_all").evaluate({}, QUESTIONS);
    const b = await new MockDecisionAdapter("allow_all").evaluate({}, QUESTIONS);
    expect(a.answers).toEqual(b.answers);
  });
});
