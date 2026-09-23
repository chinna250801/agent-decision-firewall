import { describe, it, expect } from "vitest";
import type { DecisionModelAdapter, DecisionResult, EvaluationOptions } from "./types.js";

const stub: DecisionModelAdapter = {
  name: "stub",
  capabilities: () => ({ maxChoiceOptions: 255, remote: false, supportsMultilingual: false }),
  async evaluate(
    _state: unknown,
    questions: readonly { id: string; version: number; type: string }[],
    _options?: EvaluationOptions,
  ): Promise<DecisionResult> {
    return {
      model: "stub",
      modelVersion: null,
      answers: Object.fromEntries(
        questions.map((q) => [q.id, { questionId: q.id, questionVersion: q.version, type: "noul" as const, value: 0.5 }]),
      ),
      latencyMs: 1,
      tokens: null,
      rawResponse: {},
      error: null,
    };
  },
};

describe("adapter contract", () => {
  it("normalizes answers for every requested question", async () => {
    const res = await stub.evaluate({}, [
      { id: "authorized", version: 1, type: "noul" },
      { id: "destructive", version: 1, type: "noul" },
    ]);
    expect(res.error).toBeNull();
    expect(Object.keys(res.answers).sort()).toEqual(["authorized", "destructive"]);
    expect(res.answers["authorized"]?.questionVersion).toBe(1);
  });

  it("represents failure as data, not an exception", () => {
    const failed: DecisionResult = {
      model: "stub",
      modelVersion: null,
      answers: {},
      latencyMs: 5,
      tokens: null,
      rawResponse: null,
      error: { kind: "timeout", message: "model timed out" },
    };
    expect(failed.error?.kind).toBe("timeout");
  });
});
