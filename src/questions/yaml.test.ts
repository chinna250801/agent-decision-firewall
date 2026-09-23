import { describe, it, expect } from "vitest";
import { writeFileSync, rmSync } from "node:fs";
import { parseYaml } from "./yaml.js";
import { loadQuestionRegistry } from "./registry.js";

describe("parseYaml subset", () => {
  it("parses nested maps and scalars", () => {
    const doc = parseYaml("a:\n  b: 1\n  c: hello\n");
    expect(doc).toEqual({ a: { b: 1, c: "hello" } });
  });

  it("parses lists of maps with the dash-line first key", () => {
    const doc = parseYaml("items:\n  - id: x\n    n: 2\n  - id: y\n    n: 3\n");
    expect(doc).toEqual({ items: [{ id: "x", n: 2 }, { id: "y", n: 3 }] });
  });

  it("parses quoted strings, booleans, and inline arrays", () => {
    const doc = parseYaml("a: \"x: y\"\nb: true\nc: [1, two, \"three\"]\n");
    expect(doc).toEqual({ a: "x: y", b: true, c: [1, "two", "three"] });
  });

  it("skips comments and blank lines", () => {
    const doc = parseYaml("# header\n\na: 1  # trailing comments are stripped only if whole-line\n");
    expect(doc).toEqual({ a: 1 });
  });
});

describe("loadQuestionRegistry", () => {
  it("loads config/questions.v1.yaml with all 8 questions", () => {
    const reg = loadQuestionRegistry("config/questions.v1.yaml");
    expect(reg.version).toBe(1);
    expect(reg.questions).toHaveLength(8);
    const ids = reg.questions.map((q) => q.id);
    for (const id of ["authorized", "scope_compliant", "destructive", "sensitive", "suspicious", "reversible", "risk", "requires_confirmation"]) {
      expect(ids).toContain(id);
    }
    const risk = reg.questions.find((q) => q.id === "risk")!;
    expect(risk.type).toBe("score");
    if (risk.type === "score") expect(risk.levels).toHaveLength(5);
  });

  it("rejects a registry missing a required question", () => {
    const tmp = "config/broken-for-test.yaml";
    writeFileSync(tmp, "version: 2\nquestions:\n  - id: authorized\n    type: noul\n    version: 1\n    definition: d\n    description: e\n    expectedOutput: o\n    evaluationCriteria: c\n");
    expect(() => loadQuestionRegistry(tmp)).toThrow(/missing required question/);
    rmSync(tmp);
  });
});
