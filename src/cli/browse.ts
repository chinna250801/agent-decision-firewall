import { join, resolve } from "node:path";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { loadConfig } from "../config/config.js";
import { loadQuestionRegistry } from "../questions/registry.js";
import { AuditLog } from "../audit/audit.js";
import { createAdapter } from "./adapters.js";
import { PlaywrightDriver } from "../browser/playwright-driver.js";
import { BrowserGuard } from "../browser/guard.js";
import { chooseNextStep } from "../browser/choose.js";
import { runBrowserGoal } from "../browser/loop.js";
import { defaultSessionConfig, isolationViolations, type BrowserSessionConfig } from "../browser/session.js";

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "../..");

function argValue(argv: string[], flag: string): string | undefined {
  const i = argv.indexOf(flag);
  return i >= 0 ? argv[i + 1] : undefined;
}

export interface BrowseArgs {
  goal: string;
  url: string;
  model?: string;
  config?: string;
  mockMode?: string;
  maxSteps?: number;
  verbose: boolean;
  audit: boolean;
}

/** Parse `firewall browse ...` arguments. */
export function parseBrowseArgs(argv: string[]): BrowseArgs {
  const positional = argv.find((a, i) => !a.startsWith("--") && argv[i - 1] !== "--goal" && argv[i - 1] !== "--url");
  const goal = argValue(argv, "--goal") ?? positional;
  const url = argValue(argv, "--url");
  if (!goal) throw new Error("firewall browse needs a goal (positional or --goal)");
  return {
    goal,
    url: url ?? "",
    model: argValue(argv, "--model"),
    config: argValue(argv, "--config"),
    mockMode: argValue(argv, "--mock-mode"),
    maxSteps: argValue(argv, "--max-steps") ? Number(argValue(argv, "--max-steps")) : undefined,
    verbose: argv.includes("-v") || argv.includes("--verbose"),
    audit: !argv.includes("--no-audit"),
  };
}

export async function cmdBrowse(argv: string[]): Promise<number> {
  let args: BrowseArgs;
  try {
    args = parseBrowseArgs(argv);
  } catch (e) {
    console.error(String(e instanceof Error ? e.message : e));
    return 2;
  }

  const session: BrowserSessionConfig = {
    ...defaultSessionConfig(),
    ...(args.url ? { allowedOrigins: [new URL(args.url).origin] } : {}),
    ...(args.maxSteps ? { maxSteps: args.maxSteps } : {}),
  };
  const violations = isolationViolations(session);
  if (violations.length > 0) {
    console.error(`refusing to launch: isolation violations: ${violations.join(", ")}`);
    return 1;
  }

  const cfg = loadConfig({ configPath: args.config ?? join(REPO_ROOT, "firewall.yaml"), cli: { model: args.model } });
  const withMock = args.mockMode ? { ...cfg, modelSettings: { ...cfg.modelSettings, mock: { mode: args.mockMode } } } : cfg;
  const adapter = createAdapter(withMock);
  const registry = loadQuestionRegistry(join(REPO_ROOT, "config/questions.v2.yaml"));
  const questions = registry.questions;
  const stepAction = questions.find((q) => q.id === "step_action");
  if (!stepAction) throw new Error("registry v2 must define step_action");

  const audit = args.audit
    ? new AuditLog(join(REPO_ROOT, "audit/browser.jsonl"))
    : undefined;
  const guard = new BrowserGuard({ adapter, questions, experiment: { id: `browse_${Date.now()}`, version: 1 }, session, audit });

  console.log(`goal   : ${args.goal}`);
  console.log(`start  : ${session.allowedOrigins[0]}`);
  console.log(`model  : ${adapter.name} · questions v${registry.version} · policy v1 · max ${session.maxSteps} steps`);
  console.log("");

  const driver = new PlaywrightDriver({ session, channel: "chrome" });
  const result = await runBrowserGoal({
    goal: args.goal,
    driver,
    guard,
    session,
    maxSteps: args.maxSteps ?? session.maxSteps,
    choose: (observation, goal, history) =>
      chooseNextStep({ adapter, stepActionQuestion: stepAction, goal, observation, history }),
  });

  console.log(`=== BROWSER RUN: ${result.status.toUpperCase()} ===`);
  for (const s of result.steps) {
    const mark = s.verdict === "ALLOW" ? "✅" : s.verdict === "ASK" ? "🟡" : "⛔";
    console.log(`${mark} step ${s.step} [${s.verdict}] ${s.summary}`);
    if (args.verbose) {
      console.log(`   reasons: ${s.reasons.join(", ") || "—"}`);
      console.log(`   goal_met=${s.goalMetProbability.toFixed(2)} stuck=${s.stuckProbability.toFixed(2)} latency=${s.latencyMs}ms`);
    }
  }
  console.log(`final url: ${result.finalUrl ?? "—"}`);
  if (result.error) console.log(`error: ${result.error}`);
  await driver.close();
  return result.status === "completed" ? 0 : result.status === "ask_user" ? 2 : 1;
}
