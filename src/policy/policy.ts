import type { DecisionResult } from "../adapters/types.js";

export type PolicyVerdict = "ALLOW" | "ASK" | "BLOCK";

export interface PolicyThresholds {
  /** Minimum noul to consider the claim true. */
  trueThreshold: number;
  /** Below this, the claim is considered false; between = uncertain → ASK. */
  falseThreshold: number;
  /** Risk level (0..4 score) at or above which we ASK the user. */
  askRiskLevel: number;
  /** Risk level at or above which we BLOCK outright. */
  blockRiskLevel: number;
}

/** Policy v1 thresholds. Bump policy version when these change. */
export const POLICY_V1: PolicyThresholds = {
  trueThreshold: 0.7,
  falseThreshold: 0.3,
  askRiskLevel: 3,
  blockRiskLevel: 4,
};

export const POLICY_VERSION = 1;

export interface PolicyOutcome {
  verdict: PolicyVerdict;
  /** Machine-checkable reasons, recorded in the audit log. */
  reasons: string[];
  policyVersion: number;
}

function isTrue(result: DecisionResult, id: string): boolean {
  return (result.answers[id]?.value ?? 0) >= POLICY_V1.trueThreshold;
}

function isFalse(result: DecisionResult, id: string): boolean {
  return (result.answers[id]?.value ?? 0) < POLICY_V1.falseThreshold;
}

/**
 * Deterministic mapping from model answers to verdicts.
 * Order matters: BLOCK conditions run first, then ASK, then ALLOW.
 * Adapter errors must never reach here — the firewall converts them to BLOCK
 * before calling this, but we still fail closed if one slips through.
 */
export function applyPolicy(result: DecisionResult): PolicyOutcome {
  const reasons: string[] = [];
  if (result.error) {
    return { verdict: "BLOCK", reasons: [`adapter_error:${result.error.kind}`], policyVersion: POLICY_VERSION };
  }

  // Danger questions: TRUE is bad.
  if (isTrue(result, "destructive")) reasons.push("destructive");
  if (isTrue(result, "sensitive")) reasons.push("sensitive");
  if (isTrue(result, "suspicious")) reasons.push("suspicious");
  if (reasons.length > 0) return { verdict: "BLOCK", reasons, policyVersion: POLICY_VERSION };

  // Authorization/scope: must be true AND not false.
  if (isFalse(result, "authorized")) reasons.push("not_authorized");
  if (isFalse(result, "scope_compliant")) reasons.push("out_of_scope");
  if (reasons.length > 0) return { verdict: "BLOCK", reasons, policyVersion: POLICY_VERSION };

  // Uncertainty on any safety question escalates to a human.
  const uncertain = ["destructive", "sensitive", "suspicious", "authorized", "scope_compliant"].filter(
    (id) => !isTrue(result, id) && !isFalse(result, id),
  );
  if (uncertain.length > 0) return { verdict: "ASK", reasons: uncertain.map((id) => `uncertain:${id}`), policyVersion: POLICY_VERSION };

  const risk = result.answers["risk"]?.value ?? 0;
  if (risk >= POLICY_V1.blockRiskLevel) return { verdict: "BLOCK", reasons: [`risk:${risk}`], policyVersion: POLICY_VERSION };
  if (risk >= POLICY_V1.askRiskLevel) return { verdict: "ASK", reasons: [`risk:${risk}`], policyVersion: POLICY_VERSION };

  if (isTrue(result, "requires_confirmation")) {
    return { verdict: "ASK", reasons: ["requires_confirmation"], policyVersion: POLICY_VERSION };
  }

  return { verdict: "ALLOW", reasons: ["all_checks_passed"], policyVersion: POLICY_VERSION };
}
