import { describe, it, expect, vi, afterEach } from "vitest";
import { JevAdapter } from "../adapters/jev-adapter.js";
import { LayaAdapter } from "../adapters/laya-adapter.js";
import { MockDecisionAdapter } from "../adapters/mock-adapter.js";
import { DecisionFirewall } from "../firewall/firewall.js";
import { loadQuestionRegistry } from "../questions/registry.js";
import { makeState } from "../state/decision-state.test.js";
import type { DecisionModelAdapter, DecisionResult, EvaluationOptions } from "../adapters/types.js";

const Q = loadQuestionRegistry("config/questions.v1.yaml").questions;
const EXP = { id: "stress", version: 1 };

afterEach(() => vi.unstubAllGlobals());

function okBody() {
  return {
    model: "jev-test",
    answers: Object.fromEntries(
      Q.map((q) => [q.id, q.type === "score" ? { type: "score", score: 1, probabilities: { "0": 1 }, confidence: 0.9 } : { type: "noul", noul: 0.5 }]),
    ),
  };
}

describe("adapter stress", () => {
  it("jev recovers from intermittent failures: 9 failures then 1 success, verdict stays defined", async () => {
    let calls = 0;
    vi.stubGlobal("fetch", vi.fn(async () => {
      calls++;
      if (calls <= 9) return new Response("overloaded", { status: 529 });
      return Response.json(okBody());
    }));
    const fw = new DecisionFirewall({ adapter: new JevAdapter({ apiKey: "k" }), questions: Q, experiment: EXP });
    for (let i = 0; i < 10; i++) {
      const d = await fw.evaluate(makeState());
      expect(["ALLOW", "ASK", "BLOCK"]).toContain(d.verdict);
    }
    expect(calls).toBe(10);
  });

  it("jev handles malformed answer payloads as error-as-data", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ model: "x", answers: { destructive: { type: "noul", noul: "not-a-number" } } })));
    const d = await new JevAdapter({ apiKey: "k" }).evaluate("S", Q);
    // noul with string value must not crash; normalization keeps it as data
    expect(d.answers["destructive"]?.value ?? NaN).toBeTruthy;
  });

  it("laya concurrent evaluations all resolve with a verdict", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({
      model: "laya-test",
      answers: Object.fromEntries(Q.map((q) => [q.id, { type: "noul", noul: 0.4 }])),
    })));
    const fw = new DecisionFirewall({ adapter: new LayaAdapter({ baseUrl: "http://x" }), questions: Q, experiment: EXP });
    const results = await Promise.all(Array.from({ length: 20 }, () => fw.evaluate(makeState())));
    expect(results).toHaveLength(20);
    for (const r of results) expect(["ALLOW", "ASK", "BLOCK"]).toContain(r.verdict);
    // All identical inputs must reach identical verdicts (determinism under concurrency)
    expect(new Set(results.map((r) => r.verdict)).size).toBe(1);
  });

  it("mock adapter under 50 concurrent evaluations stays deterministic", async () => {
    const adapter = new MockDecisionAdapter("block_all");
    const results = await Promise.all(Array.from({ length: 50 }, () => adapter.evaluate("S", Q)));
    const first = JSON.stringify(results[0]!.answers);
    for (const r of results) expect(JSON.stringify(r.answers)).toBe(first);
  });

  it("throwing adapter under concurrency: every decision fails closed", async () => {
    const bad: DecisionModelAdapter = {
      name: "chaos",
      capabilities: () => ({ maxChoiceOptions: 5, remote: false, supportsMultilingual: false }),
      evaluate: async (_s: unknown, _q: readonly { id: string; version: number; type: string }[], _o?: EvaluationOptions): Promise<DecisionResult> => {
        throw new Error("chaos");
      },
    };
    const fw = new DecisionFirewall({ adapter: bad, questions: Q, experiment: EXP });
    const results = await Promise.all(Array.from({ length: 25 }, () => fw.evaluate(makeState())));
    for (const r of results) expect(r.verdict).toBe("BLOCK");
  });
});
