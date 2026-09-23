import { BrowserGuard } from "../browser/guard.js";
import { loadBrowserDataset, type BrowserTestCase } from "../browser/load-cases.js";
import { stepToState } from "../browser/step.js";
import { defaultSessionConfig } from "../browser/session.js";
import { runEvaluation, type EvalReport } from "./runner.js";
import type { DecisionModelAdapter } from "../adapters/types.js";
import type { FirewallQuestion } from "../questions/types.js";

const WEB_DANGEROUS = new Set(["web_injection", "web_hidden_destructive", "web_sensitive", "web_urgency"]);

/**
 * Evaluate browser datasets through the same firewall+metrics pipeline.
 * Each case's recorded operation is evaluated as one guarded step; goal/stuck/
 * injection expectations ride on the same normalized answers.
 */
export async function runBrowserEvaluation(input: {
  adapter: DecisionModelAdapter;
  questions: readonly FirewallQuestion[];
  experiment: { id: string; version: number };
  datasetPath: string;
}): Promise<EvalReport & { webCases: number }> {
  const cases: BrowserTestCase[] = loadBrowserDataset(input.datasetPath);
  const guard = new BrowserGuard({
    adapter: input.adapter,
    questions: input.questions,
    experiment: input.experiment,
    session: defaultSessionConfig(),
  });

  // Reuse the file-domain runner by translating guarded steps into decision states.
  const decisions = [];
  for (const c of cases) {
    decisions.push({ id: c.id, category: c.category, expected: c.expected, policyExpectation: c.policyExpectation, decision: await guard.evaluateStep(c.step) });
  }

  // Delegate metric computation to the shared runner by synthesizing a mini-run.
  const report = await runEvaluation({
    adapter: input.adapter,
    questions: input.questions,
    experiment: input.experiment,
    cases: cases.map((c) => browserCaseToFileCase(c)),
  });

  const escapeByCategory: Record<string, number> = {};
  for (const d of decisions) {
    const dangerous = WEB_DANGEROUS.has(d.category) || d.expected.destructive || d.expected.sensitive;
    if (dangerous && d.decision.verdict === "ALLOW") {
      escapeByCategory[d.category] = (escapeByCategory[d.category] ?? 0) + 1;
    }
  }
  const dangerousCount = decisions.filter((d) => WEB_DANGEROUS.has(d.category) || d.expected.destructive || d.expected.sensitive).length;
  const escapes = Object.values(escapeByCategory).reduce((a, b) => a + b, 0);

  return {
    ...report,
    webCases: decisions.length,
    dangerousEscapeRate: dangerousCount === 0 ? 0 : escapes / dangerousCount,
    escapeByCategory,
  };
}

/** Translate a browser case into the canonical file-domain TestCase shape. */
function browserCaseToFileCase(c: BrowserTestCase): Parameters<typeof runEvaluation>["0"]["cases"][number] {
  const state = stepToState(c.step, ["https://example.com"]);
  return {
    id: c.id,
    category: c.category,
    state,
    expected: c.expected as never,
    policyExpectation: c.policyExpectation,
  };
}
