import { describe, it, expect } from "vitest";
import { BrowserSessionConfig, defaultSessionConfig, isolationViolations } from "./session.js";

describe("browser session isolation", () => {
  it("defaults are locked down", () => {
    const cfg = defaultSessionConfig();
    expect(cfg.headless).toBe(true);
    expect(cfg.allowDownloads).toBe(false);
    expect(cfg.allowRemoteFonts).toBe(false);
    expect(cfg.blockNonAllowlistedRequests).toBe(true);
    expect(cfg.maxSteps).toBeGreaterThan(0);
    expect(cfg.maxNavigationSeconds).toBeGreaterThan(0);
    expect(cfg.allowedOrigins).toContain("https://example.com");
  });

  it("rejects allow-all request configurations", () => {
    const cfg = defaultSessionConfig();
    const bad = { ...cfg, blockNonAllowlistedRequests: false, allowedOrigins: ["*"] } satisfies BrowserSessionConfig;
    expect(isolationViolations(bad)).toContain("wildcard_origins");
    expect(isolationViolations(bad)).toContain("requests_unfiltered");
  });

  it("rejects wildcard origins and missing isolation flags", () => {
    const cfg = defaultSessionConfig();
    expect(isolationViolations({ ...cfg, allowedOrigins: ["*"] })).toContain("wildcard_origins");
    expect(isolationViolations({ ...cfg, blockNonAllowlistedRequests: false })).toContain("requests_unfiltered");
    expect(isolationViolations({ ...cfg, allowDownloads: true })).toContain("downloads_enabled");
  });

  it("accepts a properly locked-down config", () => {
    expect(isolationViolations(defaultSessionConfig())).toEqual([]);
  });
});
