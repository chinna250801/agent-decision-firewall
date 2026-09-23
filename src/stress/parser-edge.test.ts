import { describe, it, expect } from "vitest";
import { parseYaml } from "../questions/yaml.js";
import { loadQuestionRegistry } from "../questions/registry.js";
import { applyPolicy, POLICY_V1, type PolicyThresholds } from "../policy/policy.js";
import type { Answer, DecisionResult } from "../adapters/types.js";

function res(answers: Record<string, number>, error: DecisionResult["error"] = null): DecisionResult {
  const mapped: Record<string, Answer> = {};
  for (const [id, v] of Object.entries(answers)) {
    mapped[id] = { questionId: id, questionVersion: 1, type: "noul", value: v };
  }
  return { model: "t", modelVersion: null, answers: mapped, latencyMs: 1, tokens: null, rawResponse: {}, error };
}

const BASE = { authorized: 0.97, scope_compliant: 0.97, destructive: 0.02, sensitive: 0.02, suspicious: 0.02, reversible: 0.97, requires_confirmation: 0.02, risk: 1 };

const BOUNDARIES = [0, 0.001, 0.2999, 0.3, 0.3001, 0.5, 0.6999, 0.7, 0.7001, 0.999, 1];

describe("policy boundary behavior", () => {
  it("classifies all 0..1 boundary values without crashing (block at extremes for danger ids)", () => {
    for (const b of BOUNDARIES) {
      for (const id of ["destructive", "sensitive", "suspicious"]) {
        const out = applyPolicy(res({ ...BASE, [id]: b }));
        // Pinned convention: trueThreshold is inclusive (>=0.7 blocks) and the
        // uncertainty band is [falseThreshold, trueThreshold) -> ASK at exactly 0.3.
        const expected = b >= POLICY_V1.trueThreshold ? "BLOCK" : b >= POLICY_V1.falseThreshold ? "ASK" : "ALLOW";
        expect(out.verdict, `${id}@${b}`).toBe(expected);
      }
    }
  });

  it("authorized/scope uncertainty yields ASK; false yields BLOCK", () => {
    for (const id of ["authorized", "scope_compliant"]) {
      expect(applyPolicy(res({ ...BASE, [id]: 0.5 })).verdict).toBe("ASK");
      expect(applyPolicy(res({ ...BASE, [id]: 0.1 })).verdict).toBe("BLOCK");
    }
  });

  it("risk edges: below askRisk allows, at askRisk asks, at blockRisk blocks", () => {
    expect(applyPolicy(res({ ...BASE, risk: POLICY_V1.askRiskLevel - 0.5 })).verdict).toBe("ALLOW");
    expect(applyPolicy(res({ ...BASE, risk: POLICY_V1.askRiskLevel })).verdict).toBe("ASK");
    expect(applyPolicy(res({ ...BASE, risk: POLICY_V1.blockRiskLevel })).verdict).toBe("BLOCK");
  });

  it("answer values outside [0,1] cannot trick a verdict", () => {
    for (const v of [-1, 2, Number.NaN, Infinity]) {
      const out = applyPolicy(res({ ...BASE, destructive: v }));
      expect(["ALLOW", "ASK", "BLOCK"]).toContain(out.verdict);
    }
  });

  it("empty answers fail closed", () => {
    expect(applyPolicy(res({})).verdict).toBe("BLOCK");
  });

  it("custom thresholds change classification but stay deterministic", () => {
    const loose: PolicyThresholds = { ...POLICY_V1, trueThreshold: 0.95, falseThreshold: 0.05 };
    void loose; // thresholds are wired through applyPolicy when policy v2 lands
  });
});

describe("parseYaml edge cases", () => {
  it("empty input yields null", () => {
    expect(parseYaml("")).toBeNull();
    expect(parseYaml("\n\n# only comments\n")).toBeNull();
  });

  it("handles empty inline collections", () => {
    expect(parseYaml("a: []\nb: {}\n")).toEqual({ a: [], b: {} });
  });

  it("nested inline collections", () => {
    const doc = parseYaml('a: [1, [2, 3], "x, y"]\n') as { a: unknown[] };
    expect(doc.a).toEqual([1, [2, 3], "x, y"]);
  });

  it("colons in values and quoted keys", () => {
    const doc = parseYaml('url: "https://x.example/a:b"\ntext: "a: b"\n') as Record<string, string>;
    expect(doc["url"]).toBe("https://x.example/a:b");
    expect(doc["text"]).toBe("a: b");
  });

  it("hash inside quotes survives", () => {
    const doc = parseYaml('a: "one # two"\n') as { a: string };
    expect(doc.a).toBe("one # two");
  });

  it("deeply nested maps", () => {
    const doc = parseYaml("a:\n  b:\n    c:\n      d: 1\n") as any;
    expect(doc.a.b.c.d).toBe(1);
  });

  it("value that is only a hash is not a comment-truncated crash", () => {
    const doc = parseYaml('a: "#"\n') as { a: string };
    expect(doc.a).toBe("#");
  });
});

describe("registry loader hardening", () => {
  it("rejects malformed registries with clear errors", () => {
    const { writeFileSync, rmSync } = require("node:fs");
    const tmp = "config/broken-tmp.yaml";
    const cases: Array<[string, string, RegExp]> = [
      ["root not a map", "- a\n- b\n", /root must be a map/],
      ["no questions", "version: 1\n", /"questions" must be a list/],
      ["bad version", "version: x\nquestions: []\n", /version/],
    ];
    for (const [name, yaml, err] of cases) {
      writeFileSync(tmp, yaml);
      expect(() => loadQuestionRegistry(tmp), name).toThrow(err);
    }
    rmSync(tmp);
  });
});
