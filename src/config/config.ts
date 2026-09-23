import { readFileSync, existsSync } from "node:fs";
import { parseYaml, type YamlValue } from "../questions/yaml.js";

export type ProviderName = "jev" | "laya" | "mock";

export interface FirewallConfig {
  model: ProviderName;
  /** Versioned experiment id; changes whenever model/questions/policy change. */
  experiment: { id: string; version: number };
  /** Path to the question registry YAML. */
  questionsPath: string;
  /** Model-specific settings stay HERE, never in firewall/policy code. */
  modelSettings: Partial<Record<ProviderName, Record<string, unknown>>>;
  /** Seconds of decision-request timeout. */
  timeoutMs: number;
}

const DEFAULTS: FirewallConfig = {
  model: "mock",
  experiment: { id: "firewall_v1_scope_check", version: 1 },
  questionsPath: "config/questions.v1.yaml",
  modelSettings: {},
  timeoutMs: 10_000,
};

function isObj(v: YamlValue | undefined): v is { [k: string]: YamlValue } {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function fromFile(path: string): Partial<FirewallConfig> {
  if (!existsSync(path)) return {};
  const doc = parseYaml(readFileSync(path, "utf8"));
  if (!isObj(doc)) throw new Error(`${path}: root must be a map`);
  const decisionModel = isObj(doc["decision_model"]) ? doc["decision_model"]! : {};
  const experiment = isObj(doc["experiment"]) ? doc["experiment"]! : {};
  const out: Partial<FirewallConfig> = {};
  const provider = decisionModel["provider"];
  if (typeof provider === "string") {
    if (!["jev", "laya", "mock"].includes(provider)) throw new Error(`${path}: unknown provider "${provider}"`);
    out.model = provider as ProviderName;
  }
  if (isObj(decisionModel["settings"])) {
    out.modelSettings = { laya: decisionModel["settings"] as Record<string, unknown> };
  }
  if (typeof experiment["id"] === "string") {
    out.experiment = { id: experiment["id"], version: typeof experiment["version"] === "number" ? experiment["version"] : 1 };
  }
  if (typeof doc["questions"] === "string") out.questionsPath = doc["questions"];
  if (typeof doc["timeout_ms"] === "number") out.timeoutMs = doc["timeout_ms"];
  return out;
}

function fromEnv(): Partial<FirewallConfig> {
  const out: Partial<FirewallConfig> = {};
  const m = process.env["FIREWALL_MODEL"];
  if (m && ["jev", "laya", "mock"].includes(m)) out.model = m as ProviderName;
  const t = process.env["FIREWALL_TIMEOUT_MS"];
  if (t && !Number.isNaN(Number(t))) out.timeoutMs = Number(t);
  return out;
}

function fromCli(args: Record<string, string | undefined>): Partial<FirewallConfig> {
  const out: Partial<FirewallConfig> = {};
  if (args["model"] && ["jev", "laya", "mock"].includes(args["model"]!)) out.model = args["model"] as ProviderName;
  if (args["config"]) out.questionsPath = undefined; // config path handled by caller
  return out;
}

/** Precedence: defaults < file < env < explicit CLI flags. */
export function loadConfig(opts: {
  configPath?: string;
  cli?: Record<string, string | undefined>;
} = {}): FirewallConfig {
  const cfg: FirewallConfig = { ...DEFAULTS };
  const layers = [
    fromFile(opts.configPath ?? "firewall.yaml"),
    fromEnv(),
    fromCli(opts.cli ?? {}),
  ];
  for (const layer of layers) {
    for (const [k, v] of Object.entries(layer)) {
      if (v !== undefined) (cfg as unknown as Record<string, unknown>)[k] = v;
    }
  }
  return cfg;
}
