import { DecisionFirewall, type FirewallDecision } from "../firewall/firewall.js";
import type { DecisionModelAdapter } from "../adapters/types.js";
import type { FirewallQuestion } from "../questions/types.js";
import type { AuditLog } from "../audit/audit.js";
import { renderObservation } from "./observe.js";
import { operationSummary, stepToAction, stepToState, type BrowserStep } from "./step.js";
import type { BrowserSessionConfig } from "./session.js";

export interface BrowserStepDecision extends FirewallDecision {
  /** True when the chosen operation targets a node not in the observation. */
  unknownTarget: boolean;
  /** True when the operation's origin is outside the session allowlist. */
  originViolation: boolean;
}

/**
 * One browser step = one firewall decision. Observations flow to the model as
 * text; the chosen operation is mapped to a canonical action; the standard
 * policy engine issues the verdict. No new policy code for the browser domain.
 */
export class BrowserGuard {
  private fw: DecisionFirewall;

  constructor(input: {
    adapter: DecisionModelAdapter;
    questions: readonly FirewallQuestion[];
    experiment: { id: string; version: number };
    session: BrowserSessionConfig;
    audit?: AuditLog;
  }) {
    this.fw = new DecisionFirewall({ adapter: input.adapter, questions: input.questions, experiment: input.experiment, audit: input.audit });
    this.session = input.session;
  }

  private session: BrowserSessionConfig;

  originAllowed(url: string): boolean {
    try {
      const origin = new URL(url).origin;
      return this.session.allowedOrigins.includes(origin);
    } catch {
      return false;
    }
  }

  async evaluateStep(step: BrowserStep): Promise<BrowserStepDecision> {
    const observationText = renderObservation(step.observation);
    const { action, unknownTarget } = stepToAction(step);
    const state = stepToState(step, this.session.allowedOrigins);
    // Observation text rides along for the audit trail via the requirement context.
    state.requirement.text = `${state.requirement.text}\n\nPage observation (v${observationText.version}):\n${observationText.text}`;

    const decision = await this.fw.evaluate(state);
    const originViolation = !this.originAllowed(step.observation.url) || (action.target !== undefined && action.target.startsWith("http") && !this.originAllowed(action.target));
    const reasons = [...decision.reasons];
    if (unknownTarget) reasons.push("unknown_target");
    if (originViolation) reasons.push("origin_violation");
    return { ...decision, reasons, unknownTarget, originViolation };
  }
}
