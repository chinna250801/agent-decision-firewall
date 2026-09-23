import { describe, it, expect, vi, afterEach } from "vitest";
import { LayaAdapter } from "./laya-adapter.js";
import type { FirewallQuestion } from "../questions/types.js";

const Q: FirewallQuestion[] = [
  { id: "sensitive", version: 1, type: "noul", definition: "Touches secrets?", description: "d", expectedOutput: "o", evaluationCriteria: "c" },
  { id: "choice_q", version: 1, type: "choice", options: ["a", "b"], definition: "Which?", description: "d", expectedOutput: "o", evaluationCriteria: "c" },
];

afterEach(() => vi.unstubAllGlobals());

describe("LayaAdapter", () => {
  it("uses the same question schema as Jev", () => {
    const mapped = LayaAdapter.toLayaQuestions(Q);
    expect(mapped["sensitive"]).toEqual({ type: "noul", instructions: "Touches secrets?" });
    expect(mapped["choice_q"]).toMatchObject({ type: "choice", criteria: { a: null, b: null } });
  });

  it("normalizes sidecar answers into the shared DecisionResult schema", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({
          model: "laya-english",
          answers: {
            sensitive: { type: "noul", noul: 0.01 },
            choice_q: { type: "choice", choice: "b", probabilities: { a: 0.2, b: 0.8 }, confidence: 0.8 },
          },
        }),
      ),
    );
    const res = await new LayaAdapter({ baseUrl: "http://x" }).evaluate("STATE", Q);
    expect(res.error).toBeNull();
    expect(res.modelVersion).toBe("laya-english");
    expect(res.answers["sensitive"]?.value).toBeCloseTo(0.01);
    expect(res.answers["choice_q"]?.choice).toBe("b");
  });

  it("fails closed as data when the sidecar is down (local failure mode)", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("ECONNREFUSED"); }));
    const res = await new LayaAdapter({ baseUrl: "http://x" }).evaluate("S", Q);
    expect(res.error?.kind).toBe("unavailable");
    expect(Object.keys(res.answers)).toHaveLength(0);
  });

  it("treats http 500 from the sidecar as unavailable", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("boom", { status: 500 })));
    const res = await new LayaAdapter({ baseUrl: "http://x" }).evaluate("S", Q);
    expect(res.error?.kind).toBe("unavailable");
  });
});
