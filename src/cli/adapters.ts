import { JevAdapter } from "../adapters/jev-adapter.js";
import { LayaAdapter } from "../adapters/laya-adapter.js";
import { MockDecisionAdapter, type MockMode } from "../adapters/mock-adapter.js";
import type { DecisionModelAdapter } from "../adapters/types.js";
import type { FirewallConfig } from "../config/config.js";

/**
 * Single point where provider name becomes a concrete adapter. The firewall,
 * policy, and evaluator never see this file — adding a provider means adding
 * one case here and nothing else.
 */
export function createAdapter(cfg: FirewallConfig): DecisionModelAdapter {
  switch (cfg.model) {
    case "jev":
      return new JevAdapter({
        apiKey: process.env["TYPESAFE_API_KEY"] ?? "",
        ...(cfg.modelSettings["jev"] as { baseUrl?: string; model?: string } | undefined),
      });
    case "laya":
      return new LayaAdapter(cfg.modelSettings["laya"] as { baseUrl?: string; checkpoint?: "english" | "multilingual" | "typed-decisions" } | undefined);
    case "mock":
      return new MockDecisionAdapter(((cfg.modelSettings["mock"] as { mode?: MockMode } | undefined)?.mode) ?? "allow_all");
  }
}
