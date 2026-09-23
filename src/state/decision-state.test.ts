import { describe, it, expect } from "vitest";
import type { DecisionState } from "./decision-state.js";

export function makeState(overrides: Partial<DecisionState> = {}): DecisionState {
  return {
    requirement: { text: "Fix the typo in README.md" },
    workspace: { root: "/repo", allowedPaths: ["README.md"] },
    agent: { name: "test-agent", explanation: "fixing typo" },
    action: { kind: "file_write", summary: "edit README.md", target: "README.md" },
    changes: { diffs: { "README.md": "- hello\n+ Hello\n" } },
    ...overrides,
  };
}

describe("DecisionState", () => {
  it("builds a canonical minimal state", () => {
    const state = makeState();
    expect(state.requirement.text).toContain("README");
    expect(state.action.kind).toBe("file_write");
    expect(Object.keys(state.changes?.diffs ?? {})).toEqual(["README.md"]);
  });
});
