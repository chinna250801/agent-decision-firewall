import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { loadConfig } from "../config/config.js";
import { loadQuestionRegistry } from "../questions/registry.js";
import { DecisionFirewall, type FirewallDecision } from "../firewall/firewall.js";
import { AuditLog } from "../audit/audit.js";
import { createAdapter } from "./adapters.js";
import type { DecisionState, ActionKind } from "../state/decision-state.js";

/** Repo root of the installed harness — lets `check` run from any cwd (src/cli/../..). */
const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "../..");

export interface CheckArgs {
  model?: string;
  config?: string;
  mockMode?: string;
  requirement: string;
  actionKind: ActionKind;
  summary: string;
  target?: string;
  diff?: string;
  diffFile?: string;
  explanation?: string;
  allowedPaths?: string[];
  allowedOrigins?: string[];
  root?: string;
  verbose: boolean;
  exec?: boolean;
}

function argValue(argv: string[], flag: string): string | undefined {
  const i = argv.indexOf(flag);
  return i >= 0 ? argv[i + 1] : undefined;
}

function has(argv: string[], flag: string): boolean {
  return argv.includes(flag);
}

/** Parse `firewall check ...` arguments; supports real diff files and --exec. */
export function parseCheckArgs(argv: string[]): CheckArgs {
  const requirement = argValue(argv, "--requirement") ?? "";
  const summary = argValue(argv, "--summary") ?? argValue(argv, "--target") ?? "";
  if (!requirement || !summary) {
    throw new Error("firewall check needs --requirement and --summary (what the agent wants to do)");
  }
  const kindRaw = argValue(argv, "--kind") ?? "unknown";
  const kinds: ActionKind[] = ["file_write", "file_delete", "file_move", "shell", "git", "network", "deploy", "unknown"];
  if (!kinds.includes(kindRaw as ActionKind)) throw new Error(`--kind must be one of ${kinds.join("|")}`);
  return {
    model: argValue(argv, "--model"),
    config: argValue(argv, "--config"),
    mockMode: argValue(argv, "--mock-mode"),
    requirement,
    actionKind: kindRaw as ActionKind,
    summary,
    target: argValue(argv, "--target"),
    diff: argValue(argv, "--diff") ? readFileSync(argValue(argv, "--diff")!, "utf8") : undefined,
    explanation: argValue(argv, "--explanation"),
    allowedPaths: argValue(argv, "--allowed-paths")?.split(","),
    allowedOrigins: argValue(argv, "--allowed-origins")?.split(","),
    root: argValue(argv, "--root") ?? process.cwd(),
    verbose: has(argv, "--verbose") || has(argv, "-v"),
    exec: has(argv, "--exec"),
  };
}

export function printVerbose(d: FirewallDecision): void {
  console.log("  state sent to model:");
  for (const line of d.stateText.split("\n")) console.log(`    ${line}`);
  if (d.result) {
    console.log(`  model=${d.result.model} version=${d.result.modelVersion ?? "?"} latency=${d.result.latencyMs}ms`);
    for (const [id, a] of Object.entries(d.result.answers)) {
      const val = a.value !== undefined ? a.value : a.choice;
      console.log(`    ${id.padEnd(22)} ${String(val).padEnd(10)} confidence=${a.confidence ?? "-"}`);
    }
    if (d.result.error) console.log(`  ADAPTER ERROR: ${d.result.error.kind}: ${d.result.error.message}`);
  }
}

export async function cmdCheck(argv: string[]): Promise<number> {
  const args = parseCheckArgs(argv);
  const cfg0 = loadConfig({ configPath: args.config ?? "firewall.yaml", cli: { model: args.model } });
  const cfg = args.mockMode
    ? { ...cfg0, modelSettings: { ...cfg0.modelSettings, mock: { mode: args.mockMode } } }
    : cfg0;
  const questionsPath = cfg.questionsPath.startsWith("/")
    ? cfg.questionsPath
    : join(REPO_ROOT, cfg.questionsPath);
  const questions = loadQuestionRegistry(questionsPath).questions;
  const fw = new DecisionFirewall({
    adapter: createAdapter(cfg),
    questions,
    experiment: { id: cfg.experiment.id, version: cfg.experiment.version },
    // Every real decision leaves a tamper-evident trail; secrets are redacted.
    audit: new AuditLog(".firewall/audit.jsonl"),
  });

  const state: DecisionState = {
    requirement: { text: args.requirement },
    workspace: { root: args.root ?? process.cwd(), allowedPaths: args.allowedPaths },
    agent: { name: "user-agent", explanation: args.explanation },
    action: { kind: args.actionKind, summary: args.summary, target: args.target },
    environment: { cwd: args.root ?? process.cwd() },
  };

  const decision = await fw.evaluate(state);

  console.log(`\n=== FIREWALL CHECK (${decision.actionId}) ===`);
  console.log(`requirement : ${args.requirement}`);
  console.log(`action      : [${args.actionKind}] ${args.summary}${args.target ? ` -> ${args.target}` : ""}`);
  console.log(`model       : ${cfg.model} (questions v${questions[0]?.version ?? 1}, context v${decision.contextVersion}, policy v${decision.outcome?.policyVersion ?? "-"})`);
  if (args.verbose) printVerbose(decision);
  console.log(`verdict     : ${decision.verdict}`);
  console.log(`reasons     : ${decision.reasons.join(", ") || "(none)"}`);

  if (args.exec) {
    if (decision.verdict === "ALLOW") {
      console.log("executor    : approved action would run here (executor integration point)");
      return 0;
    }
    console.log(`executor    : NOT executed (verdict=${decision.verdict})`);
    return 2;
  }
  return decision.verdict === "ALLOW" ? 0 : decision.verdict === "ASK" ? 2 : 1;
}
