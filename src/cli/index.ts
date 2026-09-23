import { loadConfig } from "../config/config.js";
import { loadQuestionRegistry } from "../questions/registry.js";
import { loadDataset } from "../datasets/load.js";
import { runEvaluation } from "../eval/runner.js";
import { runBrowserEvaluation } from "../eval/browser-runner.js";
import { createAdapter } from "./adapters.js";
import { cmdCheck } from "./check.js";

function argValue(flag: string): string | undefined {
  const i = process.argv.indexOf(flag);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

function parseArgs(): Record<string, string | undefined> {
  const out: Record<string, string | undefined> = {};
  for (const flag of ["--model", "--config", "--dataset", "--experiment", "--mock-mode"]) {
    out[flag.slice(2)] = argValue(flag);
  }
  return out;
}

async function cmdEval(opts: { model?: string; config?: string; dataset?: string; experiment?: string; "mock-mode"?: string }): Promise<number> {
  const cfg = loadConfig({ configPath: opts.config ?? "firewall.yaml", cli: { model: opts.model } });
  const questions = loadQuestionRegistry(cfg.questionsPath).questions;
  const datasetPath = opts.dataset ? `config/datasets/${opts.dataset}.yaml` : "config/datasets/golden.v1.yaml";
  const cases = loadDataset(datasetPath);
  const experiment = { id: opts.experiment ?? cfg.experiment.id, version: cfg.experiment.version };
  const withMockMode = opts["mock-mode"]
    ? { ...cfg, modelSettings: { ...cfg.modelSettings, mock: { mode: opts["mock-mode"] } } }
    : cfg;
  const report = await runEvaluation({ adapter: createAdapter(withMockMode), questions, experiment, cases, timeoutMs: cfg.timeoutMs });
  printReport(report);
  // Fail CI on any dangerous escape: a firewall that lets danger through is broken.
  return report.dangerousEscapeRate > 0 ? 1 : 0;
}

function printReport(report: Awaited<ReturnType<typeof runEvaluation>>): void {
  console.log(`\n=== EVAL ${report.model} (${report.datasetSize} cases) ===`);
  console.log(`verdict accuracy      ${pct(report.verdictAccuracy)}`);
  console.log(`dangerous escape rate ${report.dangerousEscapeRate.toFixed(3)}`);
  console.log(`safe ASK friction     ${report.safeFalseBlockRate.toFixed(3)}`);
  if (Object.keys(report.escapeByCategory).length > 0) {
    console.log("escapes by category:");
    for (const [cat, n] of Object.entries(report.escapeByCategory)) console.log(`  ${cat}: ${n}`);
  }
  console.log("\nper-question dimensions:");
  console.log("question               n    acc    prec   rec    f1     brier  ece");
  for (const d of report.dimensions) {
    const m = d.metrics;
    if (m.n === 0) continue;
    console.log(
      `${d.questionId.padEnd(22)} ${String(m.n).padStart(3)}  ${pct(m.accuracy)} ${pct(m.precision)} ${pct(m.recall)} ${pct(m.f1)}  ${d.brier.toFixed(3)}  ${d.ece.toFixed(3)}`,
    );
  }
}

function pct(x: number): string {
  return (x * 100).toFixed(1).padStart(5) + "%";
}

async function cmdCompare(opts: { config?: string; dataset?: string; experiment?: string }): Promise<number> {
  const models = (argValue("--models") ?? "mock").split(",");
  const reports = [];
  for (const m of models) {
    const cfg = loadConfig({ configPath: opts.config ?? "firewall.yaml", cli: { model: m.trim() } });
    const questions = loadQuestionRegistry(cfg.questionsPath).questions;
    const cases = loadDataset(opts.dataset ? `config/datasets/${opts.dataset}.yaml` : "config/datasets/golden.v1.yaml");
    reports.push(await runEvaluation({ adapter: createAdapter(cfg), questions, experiment: { id: opts.experiment ?? "compare", version: 1 }, cases }));
  }
  console.log("\n=== A/B COMPARISON ===");
  const dims = reports[0]?.dimensions.map((d) => d.questionId) ?? [];
  const header = ["metric", ...reports.map((r) => r.model.padEnd(8))].join("  ");
  console.log(header);
  const row = (label: string, vals: string[]): void => console.log([label.padEnd(16), ...vals.map((v) => v.padEnd(8))].join("  "));
  row("verdict_acc", reports.map((r) => pct(r.verdictAccuracy)));
  row("escape_rate", reports.map((r) => r.dangerousEscapeRate.toFixed(3)));
  row("safe_friction", reports.map((r) => r.safeFalseBlockRate.toFixed(3)));
  for (const dim of dims) {
    row(dim.slice(0, 16), reports.map((r) => {
      const d = r.dimensions.find((x) => x.questionId === dim)!;
      return d.metrics.n === 0 ? "-" : pct(d.metrics.accuracy);
    }));
  }
  return 0;
}

async function cmdBrowseEval(opts: { model?: string; config?: string; dataset?: string; experiment?: string; "mock-mode"?: string }): Promise<number> {
  const cfg = loadConfig({ configPath: opts.config ?? "firewall.yaml", cli: { model: opts.model } });
  const questions = loadQuestionRegistry(cfg.questionsPath).questions;
  const datasetPath = opts.dataset ? `config/datasets/${opts.dataset}.yaml` : "config/datasets/browser-golden.v1.yaml";
  const withMockMode = opts["mock-mode"]
    ? { ...cfg, modelSettings: { ...cfg.modelSettings, mock: { mode: opts["mock-mode"] } } }
    : cfg;
  const report = await runBrowserEvaluation({
    adapter: createAdapter(withMockMode),
    questions,
    experiment: { id: opts.experiment ?? "browser_eval", version: cfg.experiment.version },
    datasetPath,
  });
  printReport(report);
  return report.dangerousEscapeRate > 0 ? 1 : 0;
}

async function main(): Promise<number> {
  const [cmd] = process.argv.slice(2);
  const opts = parseArgs();
  switch (cmd) {
    case "eval":
      return cmdEval(opts);
    case "browse-eval":
      return cmdBrowseEval(opts);
    case "compare":
      return cmdCompare(opts);
    case "check":
      return cmdCheck(process.argv.slice(3));
    case "test":
      // One-command validation: typecheck+unit tests run via npm ci; here we run
      // the full deterministic gate: golden + adversarial + regression on mock.
      for (const ds of ["golden", "adversarial", "regression"]) {
        const code = await cmdEval({ dataset: ds, model: "mock", experiment: `ci_${ds}` });
        if (code !== 0) return code;
      }
      return 0;
    default:
      console.log("usage: firewall eval|browse-eval|compare|check|test [--model jev|laya|mock] [--dataset golden.v1|browser-golden.v1] [--experiment id]");
      console.log("  firewall check --requirement \"...\" --kind shell --summary \"run tests\" --target \"npm test\" [-v] [--exec]");
      return 2;
  }
}

main().then((code) => {
  process.exitCode = code;
});
