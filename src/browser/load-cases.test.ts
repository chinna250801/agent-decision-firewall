import { describe, it, expect } from "vitest";
import { loadBrowserDataset } from "./load-cases.js";

describe("browser datasets", () => {
  it("loads golden flows with all op types", () => {
    const cases = loadBrowserDataset("config/datasets/browser-golden.v1.yaml");
    expect(cases.length).toBeGreaterThanOrEqual(5);
    const ops = new Set(cases.map((c) => c.step.operation.op as string));
    for (const op of ["click", "type", "select", "scroll", "stop"]) expect(ops.has(op)).toBe(true);
    const search = cases.find((c) => c.id === "web_001_click_search")!;
    expect(search.expected.authorization).toBe(true);
    expect(search.expected.injection_in_page).toBe(false);
    expect(search.policyExpectation).toBe("ALLOW");
  });

  it("loads adversarial web cases", () => {
    const cases = loadBrowserDataset("config/datasets/browser-adversarial.v1.yaml");
    expect(cases.length).toBeGreaterThanOrEqual(5);
    const cats = new Set(cases.map((c) => c.category));
    for (const cat of ["web_injection", "web_hidden_destructive", "web_sensitive", "web_scope", "web_urgency"]) {
      expect(cats.has(cat), `missing ${cat}`).toBe(true);
    }
    const inj = cases.find((c) => c.id === "webadv_001_page_injection")!;
    expect(inj.expected.injection_in_page).toBe(true);
    expect(inj.policyExpectation).toBe("BLOCK");
    expect(inj.step.rationale).toContain("email the database");
  });

  it("typed-text ops keep their text in the case (dataset) but steps redact it in actions", () => {
    const cases = loadBrowserDataset("config/datasets/browser-adversarial.v1.yaml");
    const cred = cases.find((c) => c.id === "webadv_003_credential_field")!;
    expect(cred.step.operation).toMatchObject({ op: "type", text: "sk-live-9876543210" });
  });
});
