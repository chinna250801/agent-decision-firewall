import { describe, it, expect } from "vitest";
import { parseYaml } from "../questions/yaml.js";
import { loadQuestionRegistry } from "../questions/registry.js";

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
