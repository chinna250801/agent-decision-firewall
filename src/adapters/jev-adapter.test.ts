import { describe, it, expect, vi, afterEach } from "vitest";
import { JevAdapter } from "./jev-adapter.js";
import type { FirewallQuestion } from "../questions/types.js";

const Q: FirewallQuestion[] = [
  { id: "destructive", version: 1, type: "noul", definition: "Is it destructive?", description: "d", expectedOutput: "o", evaluationCriteria: "c" },
  { id: "risk", version: 1, type: "score", levels: ["none", "low", "high"], definition: "Risk?", description: "d", expectedOutput: "o", evaluationCriteria: "c" },
  { id: "choice_q", version: 1, type: "choice", options: ["a", "b"], definition: "Which?", description: "d", expectedOutput: "o", evaluationCriteria: "c" },
];

const OK_BODY = {
  model: "jev-1.13.0",
  answers: {
    destructive: { type: "noul", noul: 0.03 },
    risk: { type: "score", score: 1.2, probabilities: { "0": 0.1, "1": 0.8, "2": 0.1 }, confidence: 0.8 },
    choice_q: { type: "choice", choice: "a", probabilities: { a: 0.7, b: 0.3 }, confidence: 0.7 },
  },
  usage: { input_tokens: 100, output_tokens: 10 },
};

function stubFetch(status: number, body: unknown) {
  return vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(body), { status })));
}

afterEach(() => vi.unstubAllGlobals());

describe("JevAdapter", () => {
  it("maps registry questions to native jev typed questions", () => {
    const mapped = JevAdapter.toJevQuestions(Q);
    expect(mapped["destructive"]).toEqual({ type: "noul", instructions: "Is it destructive?" });
    expect(mapped["risk"]).toMatchObject({ type: "score", criteria: ["none", "low", "high"] });
    expect(mapped["choice_q"]).toMatchObject({ type: "choice", criteria: { a: null, b: null } });
  });

  it("normalizes a successful response into typed answers", async () => {
    stubFetch(200, OK_BODY);
    const res = await new JevAdapter({ apiKey: "k" }).evaluate("STATE", Q);
    expect(res.error).toBeNull();
    expect(res.modelVersion).toBe("jev-1.13.0");
    expect(res.answers["destructive"]?.value).toBeCloseTo(0.03);
    expect(res.answers["risk"]?.confidence).toBeCloseTo(0.8);
    expect(res.tokens?.inputTokens).toBe(100);
  });

  it("returns error-as-data on HTTP failure and on missing answers", async () => {
    stubFetch(429, { error: "rate limited" });
    const limited = await new JevAdapter({ apiKey: "k" }).evaluate("S", Q);
    expect(limited.error?.kind).toBe("unavailable");
    stubFetch(200, { model: "jev-1.13.0", answers: {} });
    const missing = await new JevAdapter({ apiKey: "k" }).evaluate("S", Q);
    expect(missing.error?.kind).toBe("missing_answer");
  });

  it("maps aborted requests to timeout", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_u: unknown, init?: RequestInit) => {
        return new Promise((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => {
            const e = new Error("aborted");
            e.name = "AbortError";
            reject(e);
          });
        });
      }),
    );
    const res = await new JevAdapter({ apiKey: "k", timeoutMs: 20 }).evaluate("S", Q);
    expect(res.error?.kind).toBe("timeout");
  });
});
