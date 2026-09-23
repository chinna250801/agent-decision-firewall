import { appendFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import type { DecisionResult } from "../adapters/types.js";
import type { PolicyOutcome } from "../policy/policy.js";

export const AUDIT_SCHEMA_VERSION = 1;

export interface AuditEvent {
  schemaVersion: number;
  timestamp: string;
  actionId: string;
  traceId?: string;
  experiment: { id: string; version: number };
  model: string;
  modelVersion: string | null;
  contextVersion: number;
  policyVersion: number;
  questionVersions: Record<string, number>;
  verdict: "ALLOW" | "ASK" | "BLOCK";
  reasons: string[];
  latencyMs: number;
  adapterError: string | null;
  /** Redacted summary of the proposed action — never raw args. */
  actionSummary: string;
  actionKind: string;
}

/** Keys whose values must never reach disk. */
const REDACT_KEYS = /^(authorization|api[-_]?key|token|secret|password|passwd|credential|private[-_]?key|cookie|session[-_]?id)$/i;

export function redact(value: unknown, depth = 0): unknown {
  if (depth > 6 || value === null || value === undefined) return depth > 6 ? "[depth]" : value;
  if (Array.isArray(value)) return value.slice(0, 20).map((v) => redact(v, depth + 1));
  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>).slice(0, 50)) {
      out[k] = REDACT_KEYS.test(k) ? "[REDACTED]" : redact(v, depth + 1);
    }
    return out;
  }
  if (typeof value === "string" && value.length > 200) return value.slice(0, 200) + "…[truncated]";
  return value;
}

export class AuditLog {
  constructor(private path: string) {
    mkdirSync(dirname(this.path), { recursive: true });
  }

  record(event: Omit<AuditEvent, "schemaVersion" | "timestamp">): AuditEvent {
    const full: AuditEvent = {
      schemaVersion: AUDIT_SCHEMA_VERSION,
      timestamp: new Date().toISOString(),
      ...event,
    };
    appendFileSync(this.path, JSON.stringify(full) + "\n", "utf8");
    return full;
  }

  /** Record the normalized model result with redaction of raw payloads. */
  recordDecision(input: {
    actionId: string;
    traceId?: string;
    experiment: { id: string; version: number };
    result: DecisionResult;
    outcome: PolicyOutcome;
    contextVersion: number;
    actionSummary: string;
    actionKind: string;
    questionVersions: Record<string, number>;
  }): AuditEvent {
    return this.record({
      actionId: input.actionId,
      traceId: input.traceId,
      experiment: input.experiment,
      model: input.result.model,
      modelVersion: input.result.modelVersion,
      contextVersion: input.contextVersion,
      policyVersion: input.outcome.policyVersion,
      questionVersions: input.questionVersions,
      verdict: input.outcome.verdict,
      reasons: input.outcome.reasons,
      latencyMs: input.result.latencyMs,
      adapterError: input.result.error ? `${input.result.error.kind}: ${redact(input.result.error.message)}` : null,
      actionSummary: input.actionSummary,
      actionKind: input.actionKind,
    });
  }
}
