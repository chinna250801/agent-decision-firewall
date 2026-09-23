import { describe, it, expect } from "vitest";
import { chooseNextStep, type ChooseInput } from "./choose.js";
import type { DecisionModelAdapter, DecisionResult } from "../adapters/types.js";
import type { PageObservation, DomNode } from "./observe.js";
import type { FirewallQuestion } from "../questions/types.js";

const question: FirewallQuestion = {
  id: "step_action",
  version: 2,
  type: "choice",
  definition: "pick the next browser step",
  description: "next step",
  options: ["click:t1"],
  evaluationCriteria: "the choice must be one of the options",
  expectedOutput: "one of the options",
};

function adapterWithChoice(choice: string | null, error: DecisionResult["error"] = null): DecisionModelAdapter {
  return {
    name: "mock",
    capabilities: () => ({ maxChoiceOptions: 128, remote: false, supportsMultilingual: false }),
    evaluate: async (_s, qs): Promise<DecisionResult> => ({
      model: "mock",
      modelVersion: "test",
      answers: choice && !error
        ? { [qs[0]!.id]: { questionId: qs[0]!.id, questionVersion: 2, type: "choice", choice, probabilities: { [choice]: 0.9 }, confidence: 0.9 } }
        : {},
      latencyMs: 1,
      tokens: null,
      rawResponse: null,
      error,
    }),
  };
}

const BASE_NODES: DomNode[] = [
  { id: "t1", role: "link", label: "Home", visible: true, aboveFold: true },
  { id: "t2", role: "input", label: "Email", visible: true, aboveFold: true },
];

function input(choice: string | null, opts?: { error?: DecisionResult["error"]; goal?: string; nodes?: DomNode[] }): ChooseInput {
  return {
    adapter: adapterWithChoice(choice, opts?.error ?? null),
    stepActionQuestion: question,
    goal: opts?.goal ?? 'type "user@example.com" into the email field',
    observation: { url: "https://example.com/", title: "t", nodes: opts?.nodes ?? BASE_NODES },
    history: [],
  };
}

describe("chooseNextStep", () => {
  it("expands per-target click options plus type options for inputs", async () => {
    let seen: string[] = [];
    const inp = input("type:t2");
    inp.adapter.evaluate = async (_s, qs) => {
      const q = qs[0] as FirewallQuestion & { options?: string[] };
      seen = [...(q.options ?? [])];
      return {
        model: "mock", modelVersion: "t",
        answers: { step_action: { questionId: "step_action", questionVersion: 2, type: "choice", choice: "type:t2", probabilities: {}, confidence: 1 } },
        latencyMs: 1, tokens: null, rawResponse: null, error: null,
      };
    };
    await chooseNextStep(inp);
    expect(seen).toContain("click:t1");
    expect(seen).toContain("click:t2");
    expect(seen).toContain("type:t2");
    expect(seen).toContain("scroll");
    expect(seen).toContain("stop");
  });

  it("extracts the quoted string as the deterministic type argument", async () => {
    let chosen: { op: string; targetId?: string; text?: string } | null = null;
    const inp = input("type:t2", { goal: 'type "p@ssw0rd" into the password box' });
    inp.adapter.evaluate = async (_s, _qs) => {
      // capture happens after return via operation; re-derive by reading ops is
      // not exposed, so assert via the returned operation below instead.
      return {
        model: "mock", modelVersion: "t",
        answers: { step_action: { questionId: "step_action", questionVersion: 2, type: "choice", choice: "type:t2", probabilities: {}, confidence: 1 } },
        latencyMs: 1, tokens: null, rawResponse: null, error: null,
      };
    };
    const { operation } = await chooseNextStep(inp);
    chosen = operation as { op: string; targetId?: string; text?: string };
    expect(chosen.op).toBe("type");
    expect(chosen.targetId).toBe("t2");
    expect(chosen.text).toBe("p@ssw0rd");
  });

  it("maps an unparsable choice to stop with a rationale (fail closed)", async () => {
    const { operation, rationale } = await chooseNextStep(input("click:t99-nonexistent-option"));
    expect(operation).toEqual({ op: "stop" });
    expect(rationale).toContain("unparsed_choice");
  });

  it("fails closed on adapter error", async () => {
    const { operation, rationale } = await chooseNextStep(input(null, { error: { kind: "unavailable", message: "down" } }));
    expect(operation).toEqual({ op: "stop" });
    expect(rationale).toContain("chooser_error");
  });

  it("fails closed on missing answer", async () => {
    const { operation, rationale } = await chooseNextStep(input(null));
    expect(operation).toEqual({ op: "stop" });
    expect(rationale).toContain("chooser_error");
  });
});
