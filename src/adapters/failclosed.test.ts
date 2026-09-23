import { describe, it, expect, vi, afterEach } from "vitest";
import { DecisionFirewall } from "../firewall/firewall.js";
import { LayaAdapter } from "./laya-adapter.js";
import { JevAdapter } from "./jev-adapter.js";
import { loadQuestionRegistry } from "../questions/registry.js";
import { makeState } from "../state/decision-state.test.js";

const QUESTIONS = loadQuestionRegistry("config/questions.v1.yaml").questions;
const EXP = { id: "failclosed", version: 1 };

afterEach(() => vi.unstubAllGlobals());

function fw(adapter: Parameters<typeof DecisionFirewall.prototype.evaluate> extends never ? never : ConstructorParameters<typeof DecisionFirewall>[0]["adapter"]): DecisionFirewall {
  return new DecisionFirewall({ adapter, questions: QUESTIONS, experiment: EXP });
}

describe("fail-closed behavior", () => {
  it("BLOCKs when Laya sidecar is unreachable", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("ECONNREFUSED"); }));
    const d = await fw(new LayaAdapter({ baseUrl: "http://127.0.0.1:1" })).evaluate(makeState());
    expect(d.verdict).toBe("BLOCK");
    expect(d.reasons[0]).toBe("adapter_error:unavailable");
  });

  it("BLOCKs when Laya sidecar returns malformed JSON", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("not-json{{", { status: 200 })));
    const d = await fw(new LayaAdapter({ baseUrl: "http://x" })).evaluate(makeState());
    expect(d.verdict).toBe("BLOCK");
    expect(["adapter_error:invalid_json", "adapter_error:exception", "adapter_error:unavailable"]).toContain(d.reasons[0]);
  });

  it("BLOCKs when Jev returns 529 overloaded", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 529 })));
    const d = await fw(new JevAdapter({ apiKey: "k" })).evaluate(makeState());
    expect(d.verdict).toBe("BLOCK");
  });

  it("BLOCKs on timeout via guard and never executes", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_u: unknown, init?: RequestInit) => new Promise((_res, rej) => {
        init?.signal?.addEventListener("abort", () => { const e = new Error("x"); e.name = "AbortError"; rej(e); });
      })),
    );
    const g = new DecisionFirewall({ adapter: new LayaAdapter({ baseUrl: "http://x", timeoutMs: 20 }), questions: QUESTIONS, experiment: EXP });
    let ran = false;
    const out = await g.guard(makeState(), () => { ran = true; });
    expect(out.executed).toBe(false);
    expect(ran).toBe(false);
  });
});
