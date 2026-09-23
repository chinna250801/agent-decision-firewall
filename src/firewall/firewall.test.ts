import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { rmSync, readFileSync } from "node:fs";
import { DecisionFirewall } from "./firewall.js";
import { MockDecisionAdapter } from "../adapters/mock-adapter.js";
import { loadQuestionRegistry } from "../questions/registry.js";
import { AuditLog } from "../audit/audit.js";
import { makeState } from "../state/decision-state.test.js";
import type { DecisionModelAdapter, DecisionResult } from "../adapters/types.js";

const QUESTIONS = loadQuestionRegistry("config/questions.v1.yaml").questions;
const LOG = "tmp-fw-test/audit.jsonl";

beforeEach(() => rmSync("tmp-fw-test", { recursive: true, force: true }));
afterEach(() => rmSync("tmp-fw-test", { recursive: true, force: true }));

function throwingAdapter(): DecisionModelAdapter {
  return {
    name: "throws",
    capabilities: () => ({ maxChoiceOptions: 10, remote: false, supportsMultilingual: false }),
    evaluate: async (): Promise<DecisionResult> => {
      throw new Error("exploded");
    },
  };
}

describe("DecisionFirewall", () => {
  it("executes only on ALLOW", async () => {
    const fw = new DecisionFirewall({ adapter: new MockDecisionAdapter("allow_all"), questions: QUESTIONS, experiment: { id: "t", version: 1 } });
    let ran = false;
    const out = await fw.guard(makeState(), () => { ran = true; return "did-it"; });
    expect(out.executed).toBe(true);
    expect(out.output).toBe("did-it");
    expect(ran).toBe(true);
  });

  it("never executes on ASK or BLOCK, and executor cannot bypass", async () => {
    for (const mode of ["block_all", "confirm_all", "error"] as const) {
      const fw = new DecisionFirewall({ adapter: new MockDecisionAdapter(mode), questions: QUESTIONS, experiment: { id: "t", version: 1 } });
      let ran = false;
      const out = await fw.guard(makeState(), () => { ran = true; });
      expect(out.executed).toBe(false);
      expect(ran).toBe(false);
      expect(out.decision.verdict).not.toBe("ALLOW");
    }
  });

  it("fails closed BLOCK when the adapter throws despite the contract", async () => {
    const fw = new DecisionFirewall({ adapter: throwingAdapter(), questions: QUESTIONS, experiment: { id: "t", version: 1 } });
    const decision = await fw.evaluate(makeState());
    expect(decision.verdict).toBe("BLOCK");
    expect(decision.reasons[0]).toContain("adapter_exception");
  });

  it("records versioned audit events for every decision", async () => {
    const audit = new AuditLog(LOG);
    const fw = new DecisionFirewall({ adapter: new MockDecisionAdapter("block_all"), questions: QUESTIONS, experiment: { id: "exp", version: 2 }, audit });
    const decision = await fw.evaluate(makeState());
    const lines = readFileSync(LOG, "utf8").trim().split("\n");
    expect(lines).toHaveLength(1);
    const event = JSON.parse(lines[0]!);
    expect(event.model).toBe("mock");
    expect(event.experiment.id).toBe("exp");
    expect(event.experiment.version).toBe(2);
    expect(event.contextVersion).toBe(1);
    expect(event.questionVersions["authorized"]).toBe(1);
    expect(event.actionId).toBe(decision.actionId);
  });
});
