import type { DecisionModelAdapter } from "../adapters/types.js";
import type { FirewallQuestion } from "../questions/types.js";
import type { PageObservation } from "./observe.js";
import { renderObservation } from "./observe.js";
import type { BrowserOperation } from "./step.js";
import type { StepTraceEntry } from "./loop.js";

export interface ChooseInput {
  adapter: DecisionModelAdapter;
  /** The v2 registry's step_action choice question (options are expanded per target at runtime). */
  stepActionQuestion: FirewallQuestion;
  goal: string;
  observation: PageObservation;
  history: StepTraceEntry[];
}

/**
 * Split-brain chooser (WebMCP/jev-browser finding): the decision model PICKS
 * one op+target from the visible targets via the step_action choice question;
 * argument text is supplied by the deterministic micro-generator below, never
 * by the model. Code owns option construction and ordering.
 */
export async function chooseNextStep(input: ChooseInput): Promise<{ operation: BrowserOperation; rationale?: string }> {
  const { observation } = input;
  // Quoted-string extraction gives `type` a deterministic argument.
  const quoted = input.goal.match(/"([^"]{1,80})"/)?.[1];
  const wantsType = /\btype\b|fill|enter/i.test(input.goal);

  const options: string[] = [];
  const ops = new Map<string, BrowserOperation>();
  for (const node of observation.nodes) {
    if (!node.visible) continue;
    options.push(`click:${node.id}`);
    ops.set(`click:${node.id}`, { op: "click", targetId: node.id });
    if (wantsType && quoted && (node.role === "input" || node.role === "textarea")) {
      options.push(`type:${node.id}`);
      ops.set(`type:${node.id}`, { op: "type", targetId: node.id, text: quoted });
    }
  }
  options.push("scroll", "wait", "stop");
  ops.set("scroll", { op: "scroll" });
  ops.set("wait", { op: "wait" });
  ops.set("stop", { op: "stop" });

  const question: FirewallQuestion = {
    ...input.stepActionQuestion,
    id: input.stepActionQuestion.id,
    type: "choice",
    options,
  } as FirewallQuestion;
  const state = {
    requirement: { text: `Browser goal: ${input.goal}\n\nPage observation (v${renderObservation(observation).version}):\n${renderObservation(observation).text}` },
    agent: { name: "browser-agent", explanation: "choosing next step" },
    history: input.history.map((h) => `${h.step}:${h.operation.op}:${h.verdict}`).join(","),
  };

  const result = await input.adapter.evaluate(state, [question]);
  if (result.error || !result.answers[question.id]) {
    // Fail closed: no choice means no step — the loop treats this as BLOCK.
    return { operation: { op: "stop" }, rationale: `chooser_error:${result.error?.kind ?? "missing"}` };
  }
  const raw = result.answers[question.id]?.choice ?? "stop";
  const found = ops.get(raw);
  return found
    ? { operation: found, rationale: undefined }
    : { operation: { op: "stop" }, rationale: `unparsed_choice:${raw}` };
}
