import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { readFileSync, rmSync, existsSync } from "node:fs";
import { AuditLog, redact, AUDIT_SCHEMA_VERSION } from "./audit.js";
import type { DecisionResult } from "../adapters/types.js";
import type { PolicyOutcome } from "../policy/policy.js";

const LOG = "tmp-audit-test/audit.jsonl";

beforeEach(() => rmSync("tmp-audit-test", { recursive: true, force: true }));
afterEach(() => rmSync("tmp-audit-test", { recursive: true, force: true }));

function fakeResult(overrides: Partial<DecisionResult> = {}): DecisionResult {
  return {
    model: "mock",
    modelVersion: "mock-1.0.0",
    answers: {},
    latencyMs: 12,
    tokens: null,
    rawResponse: {},
    error: null,
    ...overrides,
  };
}

describe("redact", () => {
  it("removes secret-looking keys and truncates long strings", () => {
    const out = redact({
      apiKey: "sk-live-123",
      password: "hunter2",
      nested: { PRIVATE_KEY: "-----BEGIN" },
      note: "x".repeat(300),
      safe: "ok",
    });
    expect(out).toEqual({
      apiKey: "[REDACTED]",
      password: "[REDACTED]",
      nested: { PRIVATE_KEY: "[REDACTED]" },
      note: expect.stringContaining("…[truncated]"),
      safe: "ok",
    });
  });
});

describe("AuditLog", () => {
  it("writes versioned JSONL with all version fields", () => {
    const log = new AuditLog(LOG);
    const outcome: PolicyOutcome = { verdict: "BLOCK", reasons: ["sensitive"], policyVersion: 1 };
    log.recordDecision({
      actionId: "action_123",
      experiment: { id: "firewall_v1_scope_check", version: 1 },
      result: fakeResult(),
      outcome,
      contextVersion: 1,
      actionSummary: "edit README",
      actionKind: "file_write",
      questionVersions: { authorized: 1, risk: 1 },
    });
    expect(existsSync(LOG)).toBe(true);
    const line = JSON.parse(readFileSync(LOG, "utf8").trim().split("\n")[0]!);
    expect(line.schemaVersion).toBe(AUDIT_SCHEMA_VERSION);
    expect(line.actionId).toBe("action_123");
    expect(line.model).toBe("mock");
    expect(line.policyVersion).toBe(1);
    expect(line.contextVersion).toBe(1);
  });
});
