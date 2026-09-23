import type { DecisionModelAdapter, DecisionResult, EvaluationOptions } from "../adapters/types.js";
import type { DecisionState } from "../state/decision-state.js";
import { buildStateText } from "../context/build-state.js";
import { applyPolicy, type PolicyOutcome } from "../policy/policy.js";
import type { FirewallQuestion } from "../questions/types.js";
import type { AuditLog } from "../audit/audit.js";

export type Verdict = "ALLOW" | "ASK" | "BLOCK";

export interface FirewallDecision {
  actionId: string;
  verdict: Verdict;
  reasons: string[];
  result: DecisionResult | null;
  outcome: PolicyOutcome | null;
  contextVersion: number;
  stateText: string;
  latencyMs: number;
}

export interface FirewallDeps {
  adapter: DecisionModelAdapter;
  questions: readonly FirewallQuestion[];
  experiment: { id: string; version: number };
  audit?: AuditLog;
}

let actionCounter = 0;

/**
 * The enforcement point. Evaluates the proposed action through the configured
 * model adapter and policy engine. `execute` ONLY runs on ALLOW — every other
 * path (including adapter errors and throws) fails closed to BLOCK.
 */
export class DecisionFirewall {
  constructor(private deps: FirewallDeps) {}

  async evaluate(
    state: DecisionState,
    options?: EvaluationOptions,
  ): Promise<FirewallDecision> {
    const actionId = `action_${Date.now().toString(36)}_${(++actionCounter).toString(36)}`;
    const { text, version } = buildStateText(state);
    const started = Date.now();

    let result: DecisionResult | null = null;
    let outcome: PolicyOutcome | null = null;
    let verdict: Verdict = "BLOCK";
    let reasons: string[] = ["unhandled_exception"];

    try {
      result = await this.deps.adapter.evaluate(text, this.deps.questions, options);
      outcome = applyPolicy(result);
      verdict = outcome.verdict;
      reasons = outcome.reasons;
    } catch (e) {
      // An adapter that throws despite the contract must still fail closed.
      reasons = [`adapter_exception:${String(e).slice(0, 200)}`];
    }

    const decision: FirewallDecision = {
      actionId,
      verdict,
      reasons,
      result,
      outcome,
      contextVersion: version,
      stateText: text,
      latencyMs: Date.now() - started,
    };

    this.deps.audit?.recordDecision({
      actionId,
      traceId: options?.traceId,
      experiment: this.deps.experiment,
      result: result ?? {
        model: this.deps.adapter.name,
        modelVersion: null,
        answers: {},
        latencyMs: decision.latencyMs,
        tokens: null,
        rawResponse: null,
        error: { kind: "exception", message: reasons[0] ?? "unknown" },
      },
      outcome: outcome ?? { verdict: "BLOCK", reasons, policyVersion: -1 },
      contextVersion: version,
      actionSummary: state.action.summary,
      actionKind: state.action.kind,
      questionVersions: Object.fromEntries(this.deps.questions.map((q) => [q.id, q.version])),
    });

    return decision;
  }

  /** No approval → no execution. The ONLY path to the executor. */
  async guard(
    state: DecisionState,
    execute: () => Promise<unknown> | unknown,
    options?: EvaluationOptions,
  ): Promise<{ executed: boolean; decision: FirewallDecision; output?: unknown }> {
    const decision = await this.evaluate(state, options);
    if (decision.verdict !== "ALLOW") {
      return { executed: false, decision };
    }
    return { executed: true, decision, output: await execute() };
  }
}
