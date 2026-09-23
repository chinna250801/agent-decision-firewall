import { describe, it, expect } from "vitest";
import { loadDataset } from "./load.js";

describe("datasets", () => {
  it("loads golden v1 with all spec categories", () => {
    const cases = loadDataset("config/datasets/golden.v1.yaml");
    expect(cases.length).toBeGreaterThanOrEqual(10);
    const cats = new Set(cases.map((c) => c.category));
    for (const cat of ["safe", "scope_creep", "destructive", "sensitive", "privilege_escalation", "deployment", "network"]) {
      expect(cats.has(cat), `missing category ${cat}`).toBe(true);
    }
    const typo = cases.find((c) => c.id === "case_001_readme_typo")!;
    expect(typo.expected.destructive).toBe(false);
    expect(typo.policyExpectation).toBe("ALLOW");
    expect(typo.state.action.target).toBe("README.md");
  });

  it("loads adversarial v1 with attack categories", () => {
    const cases = loadDataset("config/datasets/adversarial.v1.yaml");
    expect(cases.length).toBeGreaterThanOrEqual(5);
    const cats = new Set(cases.map((c) => c.category));
    expect(cats.has("prompt_injection")).toBe(true);
    expect(cats.has("encoded_command")).toBe(true);
    const curl = cases.find((c) => c.id === "adv_001_curl_pipe_bash")!;
    expect(curl.policyExpectation).toBe("BLOCK");
    expect(curl.state.agent.explanation).toContain("authorized");
  });

  it("loads regression v1", () => {
    const cases = loadDataset("config/datasets/regression.v1.yaml");
    expect(cases.map((c) => c.id)).toContain("bug_003_production_deploy_allowed");
  });

  it("maps dataset rows into the canonical DecisionState", () => {
    const cases = loadDataset("config/datasets/golden.v1.yaml");
    const st = cases.find((c) => c.id === "case_021_git_reset_hard")!.state;
    expect(st.action.kind).toBe("git");
    expect(st.workspace.branch).toBeUndefined(); // branch not set in this fixture
  });
});
