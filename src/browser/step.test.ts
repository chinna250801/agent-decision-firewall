import { describe, it, expect } from "vitest";
import { operationSummary, stepToAction, stepToState, type BrowserStep } from "./step.js";
import type { PageObservation } from "./observe.js";

const obs: PageObservation = {
  url: "https://example.com/checkout",
  title: "Checkout",
  nodes: [
    { id: "t1", role: "input", label: "Email", value: "", visible: true, aboveFold: true },
    { id: "t2", role: "button", label: "Pay now", value: "#pay", visible: true, aboveFold: true },
    { id: "t3", role: "select", label: "Shipping", value: "standard", visible: true, aboveFold: true },
  ],
};

const base: BrowserStep = { goal: "Buy the standard shipping product", observation: obs, operation: { op: "click", targetId: "t2" } };

describe("browser step mapping", () => {
  it("summarizes operations readably", () => {
    expect(operationSummary(base.operation, obs)).toContain("click button \"Pay now\"");
    expect(operationSummary({ op: "type", targetId: "t1", text: "secret" }, obs)).toContain("type into input \"Email\"");
    expect(operationSummary({ op: "scroll" }, obs)).toBe("scroll");
  });

  it("resolves targets against the observation and flags unknown ids", () => {
    const ok = stepToAction(base);
    expect(ok.unknownTarget).toBe(false);
    expect(ok.action.summary).toContain("Pay now");
    const bad = stepToAction({ ...base, operation: { op: "click", targetId: "t99" } });
    expect(bad.unknownTarget).toBe(true);
  });

  it("does not carry raw typed text into the action (redaction by design)", () => {
    const { action } = stepToAction({ ...base, operation: { op: "type", targetId: "t1", text: "hunter2" } });
    expect(JSON.stringify(action.args)).not.toContain("hunter2");
    expect(action.args).toMatchObject({ textLength: 7 });
  });

  it("maps a step into a canonical DecisionState", () => {
    const state = stepToState({ ...base, rationale: "paying now" }, ["https://example.com"]);
    expect(state.requirement.text).toContain("Buy the standard shipping product");
    expect(state.agent.explanation).toBe("paying now");
    expect(state.action.kind).toBe("network");
    expect(state.environment?.relevantEnv?.["allowed_origins"]).toBe("https://example.com");
  });
});
