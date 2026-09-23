import { describe, it, expect } from "vitest";
import { BrowserGuard } from "../browser/guard.js";
import { runBrowserGoal, type BrowserDriver } from "../browser/loop.js";
import { defaultSessionConfig } from "../browser/session.js";
import { MockDecisionAdapter } from "../adapters/mock-adapter.js";
import { loadQuestionRegistry } from "../questions/registry.js";
import type { PageObservation } from "../browser/observe.js";
import type { BrowserOperation } from "../browser/step.js";

const Q = loadQuestionRegistry("config/questions.v2.yaml").questions;
const EXP = { id: "browser_stress", version: 2 };

const PAGE: PageObservation = {
  url: "https://example.com/",
  title: "T",
  nodes: [{ id: "t1", role: "button", label: "Go", visible: true, aboveFold: true }],
};

function driver(over?: Partial<PageObservation>, crashOnApply = false): BrowserDriver {
  const page = { ...PAGE, ...over };
  return {
    async start() { return page; },
    async apply() { if (crashOnApply) throw new Error("driver crashed mid-click"); return page; },
    async close() {},
  };
}

function chooser(ops: BrowserOperation[]) {
  let i = 0;
  return async () => ({ operation: ops[Math.min(i, ops.length - 1)]!, rationale: "t" , i: i++ });
}

function guard(mode: "allow_all" | "block_all" | "confirm_all" = "allow_all") {
  return new BrowserGuard({ adapter: new MockDecisionAdapter(mode), questions: Q, experiment: EXP, session: defaultSessionConfig() });
}

async function run(over: Partial<Parameters<typeof runBrowserGoal>[0]> & { driver: BrowserDriver; choose: ReturnType<typeof chooser> }) {
  return runBrowserGoal({ goal: "g", guard: guard(), session: defaultSessionConfig(), ...over });
}

describe("browser loop gates", () => {
  it("ASK verdict surfaces as ask_user and executes nothing further", async () => {
    const r = await run({ driver: driver(), choose: chooser([{ op: "click", targetId: "t1" }]), guard: guard("confirm_all") });
    expect(r.status).toBe("ask_user");
    expect(r.steps).toHaveLength(1);
  });

  it("unknown target id blocks the run", async () => {
    const r = await run({ driver: driver(), choose: chooser([{ op: "click", targetId: "t99" }]) });
    expect(r.status).toBe("blocked");
    expect(r.steps[0]!.reasons).toContain("unknown_target");
  });

  it("off-allowlist observation URL blocks the run", async () => {
    const r = await run({ driver: driver({ url: "https://evil.example.net/" }), choose: chooser([{ op: "click", targetId: "t1" }]) });
    expect(r.status).toBe("blocked");
    expect(r.steps[0]!.reasons).toContain("origin_violation");
  });

  it("driver crash after approval fails closed with executor_error and no throw", async () => {
    const r = await run({ driver: driver(undefined, true), choose: chooser([{ op: "click", targetId: "t1" }]) });
    expect(r.status).toBe("executor_error");
    expect(r.error).toContain("driver crashed");
  });
});
