import { describe, it, expect } from "vitest";
import { BrowserGuard } from "./guard.js";
import { runBrowserGoal, type BrowserDriver, type RunResult } from "./loop.js";
import { defaultSessionConfig } from "./session.js";
import { MockDecisionAdapter } from "../adapters/mock-adapter.js";
import { loadQuestionRegistry } from "../questions/registry.js";
import { stepToAction, operationSummary } from "../browser/step.js";
import type { PageObservation, DomNode } from "./observe.js";
import type { BrowserOperation } from "./step.js";

const QUESTIONS = loadQuestionRegistry("config/questions.v2.yaml").questions;

const PAGE: PageObservation = {
  url: "https://example.com/search",
  title: "Search",
  nodes: [
    { id: "t1", role: "input", label: "Query", value: "", visible: true, aboveFold: true },
    { id: "t2", role: "button", label: "Search", visible: true, aboveFold: true },
  ],
};

/** Deterministic driver: applies ops by mutating a local page copy. */
function scriptedDriver(script: BrowserOperation[]): BrowserDriver & { pages: PageObservation[] } {
  const pages: PageObservation[] = [PAGE];
  let i = 0;
  return {
    pages,
    async start() {
      return pages[0]!;
    },
    async apply(op: BrowserOperation) {
      const next = script[i];
      i++;
      if (next) pages.push({ ...PAGE, url: `${PAGE.url}?step=${i}` });
      return pages[pages.length - 1]!;
    },
    async close() {},
  };
}

/** Chooses from the script until exhausted, then stops. */
function scriptChooser(script: BrowserOperation[]) {
  let i = 0;
  return async () => {
    const op = script[Math.min(i, script.length - 1)]!;
    i++;
    return { operation: op, rationale: "scripted" };
  };
}

function makeGuard(adapterMode: "allow_all" | "block_all" = "allow_all"): BrowserGuard {
  return new BrowserGuard({
    adapter: new MockDecisionAdapter(adapterMode),
    questions: QUESTIONS,
    experiment: { id: "browser_test", version: 2 },
    session: defaultSessionConfig(),
  });
}

describe("runBrowserGoal", () => {
  it("completes a scripted flow when every step is approved", async () => {
    const script: BrowserOperation[] = [
      { op: "type", targetId: "t1", text: "tents" },
      { op: "click", targetId: "t2" },
      { op: "stop" },
    ];
    const driver = scriptedDriver(script);
    const result: RunResult = await runBrowserGoal({
      goal: "search for tents",
      driver,
      guard: makeGuard(),
      session: defaultSessionConfig(),
      choose: scriptChooser(script),
    });
    expect(result.status).toBe("completed");
    expect(result.steps).toHaveLength(3);
    expect(result.steps.every((s) => s.verdict === "ALLOW")).toBe(true);
  });

  it("blocks immediately when the firewall rejects a step", async () => {
    const script: BrowserOperation[] = [{ op: "click", targetId: "t2" }, { op: "stop" }];
    const result = await runBrowserGoal({
      goal: "attack",
      driver: scriptedDriver(script),
      guard: makeGuard("block_all"),
      session: defaultSessionConfig(),
      choose: scriptChooser(script),
    });
    expect(result.status).toBe("blocked");
    expect(result.steps).toHaveLength(1);
    expect(result.steps[0]!.verdict).toBe("BLOCK");
  });

  it("stops at the step budget", async () => {
    const script: BrowserOperation[] = [{ op: "scroll" }];
    const result = await runBrowserGoal({
      goal: "endless scrolling",
      driver: scriptedDriver(script),
      guard: makeGuard(),
      session: defaultSessionConfig(),
      choose: scriptChooser(script),
      maxSteps: 4,
    });
    expect(result.status).toBe("budget_exhausted");
    expect(result.steps).toHaveLength(4);
  });

  it("records per-step trace with summaries", async () => {
    const script: BrowserOperation[] = [{ op: "click", targetId: "t2" }, { op: "stop" }];
    const result = await runBrowserGoal({
      goal: "search",
      driver: scriptedDriver(script),
      guard: makeGuard(),
      session: defaultSessionConfig(),
      choose: scriptChooser(script),
    });
    expect(result.steps[0]!.summary).toBe(operationSummary(script[0]!, PAGE));
    expect(result.steps[0]!.step).toBe(1);
  });

  it("stepToAction maps scripted ops against the page", () => {
    const { unknownTarget } = stepToAction({ goal: "g", observation: PAGE, operation: { op: "click", targetId: "t2" } });
    expect(unknownTarget).toBe(false);
  });
});
