import { describe, it, expect } from "vitest";
import { buildStateText, CONTEXT_VERSION } from "./build-state.js";
import { makeState } from "../state/decision-state.test.js";

describe("buildStateText", () => {
  it("produces stable v1 text with all core sections", () => {
    const { version, text } = buildStateText(makeState());
    expect(version).toBe(CONTEXT_VERSION);
    expect(version).toBe(1);
    expect(text).toContain("## REQUIREMENT");
    expect(text).toContain("Fix the typo in README.md");
    expect(text).toContain("kind: file_write");
    expect(text).toContain('--- README.md ---');
    expect(text).toContain('- hello');
    expect(text).toContain('+ Hello');
    expect(text).toContain("allowed_paths: README.md");
  });

  it("clips oversized diffs and reports the overflow", () => {
    const longDiff = "x".repeat(5000);
    const { text } = buildStateText(makeState({ changes: { diffs: { "big.txt": longDiff } } }));
    expect(text).toContain("[+4");
    expect(text).not.toContain("x".repeat(1000));
  });

  it("is deterministic: same state, same text", () => {
    const a = buildStateText(makeState()).text;
    const b = buildStateText(makeState()).text;
    expect(a).toBe(b);
  });

  it("includes prior actions when history exists", () => {
    const { text } = buildStateText(
      makeState({
        history: { priorActions: [{ summary: "edit README", decision: "ALLOW" }] },
      }),
    );
    expect(text).toContain("## PRIOR ACTIONS");
    expect(text).toContain("ALLOW: edit README");
  });
});
