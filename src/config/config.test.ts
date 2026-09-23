import { describe, it, expect, afterEach } from "vitest";
import { loadConfig } from "./config.js";

afterEach(() => {
  delete process.env["FIREWALL_MODEL"];
  delete process.env["FIREWALL_TIMEOUT_MS"];
});

describe("loadConfig", () => {
  it("defaults to mock with registry v1", () => {
    const cfg = loadConfig({ configPath: "does-not-exist.yaml" });
    expect(cfg.model).toBe("mock");
    expect(cfg.questionsPath).toContain("questions.v1.yaml");
  });

  it("reads provider from firewall.yaml-style file", () => {
    const cfg = loadConfig({ configPath: "config/test-fixtures/firewall-laya.yaml" });
    expect(cfg.model).toBe("laya");
    expect(cfg.experiment.id).toBe("firewall_v1_scope_check");
  });

  it("env overrides file", () => {
    process.env["FIREWALL_MODEL"] = "jev";
    const cfg = loadConfig({ configPath: "config/test-fixtures/firewall-laya.yaml" });
    expect(cfg.model).toBe("jev");
  });

  it("cli overrides env", () => {
    process.env["FIREWALL_MODEL"] = "jev";
    const cfg = loadConfig({ configPath: "does-not-exist.yaml", cli: { model: "mock" } });
    expect(cfg.model).toBe("mock");
  });

  it("rejects unknown providers from file", () => {
    expect(() => loadConfig({ configPath: "config/test-fixtures/firewall-bad.yaml" })).toThrow(/unknown provider/);
  });

  it("keys modelSettings by provider name, not hard-coded to laya", () => {
    const cfg = loadConfig({ configPath: "config/test-fixtures/firewall-mock.yaml" });
    expect(cfg.model).toBe("mock");
    expect(cfg.modelSettings["mock"]).toEqual({ mode: "block_all" });
    expect(cfg.modelSettings["laya"]).toBeUndefined();
  });

  it("keeps laya settings under laya for the laya fixture", () => {
    const cfg = loadConfig({ configPath: "config/test-fixtures/firewall-laya.yaml" });
    expect(cfg.modelSettings["laya"]).toEqual({ checkpoint: "english" });
  });
});
