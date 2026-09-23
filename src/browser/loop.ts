import type { BrowserSessionConfig } from "./session.js";
import { BrowserGuard, type BrowserStepDecision } from "./guard.js";
import type { BrowserOperation } from "./step.js";
import type { PageObservation } from "./observe.js";

export interface StepTraceEntry {
  step: number;
  operation: BrowserOperation;
  summary: string;
  verdict: "ALLOW" | "ASK" | "BLOCK";
  reasons: string[];
  goalMetProbability: number;
  stuckProbability: number;
  latencyMs: number;
}

export interface RunResult {
  status: "completed" | "blocked" | "budget_exhausted" | "stuck" | "ask_user" | "executor_error";
  steps: StepTraceEntry[];
  finalUrl: string | null;
  /** Set when the executor/driver itself failed; the run must fail closed. */
  error?: string;
}

/** Observation provider: implemented by a real Playwright driver (M4). */
export type ObservationFn = (op: BrowserOperation) => Promise<PageObservation>;

export interface BrowserDriver {
  start(): Promise<PageObservation>;
  apply(op: BrowserOperation): Promise<PageObservation>;
  close(): Promise<void>;
}

/**
 * Code owns the loop; the model only decides; the firewall approves.
 * Hard stop gates: max steps, BLOCK verdict, stuck-ness, goal completion.
 */
export async function runBrowserGoal(input: {
  goal: string;
  driver: BrowserDriver;
  guard: BrowserGuard;
  session: BrowserSessionConfig;
  choose: (observation: PageObservation, goal: string, history: StepTraceEntry[]) => Promise<{ operation: BrowserOperation; rationale?: string }>;
  maxSteps?: number;
}): Promise<RunResult> {
  const maxSteps = input.maxSteps ?? input.session.maxSteps;
  const steps: StepTraceEntry[] = [];
  let observation: PageObservation;
  try {
    observation = await input.driver.start();
  } catch (e) {
    // Cannot even observe the page: fail closed, execute nothing.
    return { status: "executor_error", steps, finalUrl: null, error: String(e).slice(0, 200) };
  }

  for (let stepNum = 1; stepNum <= maxSteps; stepNum++) {
    const history = steps;
    const { operation, rationale } = await input.choose(observation, input.goal, history);
    const { stepToAction } = await import("./step.js");
    const { operationSummary } = await import("./step.js");

    const step = { goal: input.goal, observation, operation, rationale };
    const decision: BrowserStepDecision = await input.guard.evaluateStep(step);

    const answerValue = (id: string): number => decision.result?.answers[id]?.value ?? 0;
    const entry: StepTraceEntry = {
      step: stepNum,
      operation,
      summary: operationSummary(operation, observation),
      verdict: decision.verdict,
      reasons: decision.reasons,
      goalMetProbability: answerValue("goal_met"),
      stuckProbability: answerValue("stuck"),
      latencyMs: decision.latencyMs,
    };
    steps.push(entry);

    if (decision.verdict === "BLOCK") return { status: "blocked", steps, finalUrl: observation.url };
    if (decision.verdict === "ASK") return { status: "ask_user", steps, finalUrl: observation.url };
    if (operation.op === "stop") {
      return { status: entry.goalMetProbability >= 0.5 ? "completed" : "stuck", steps, finalUrl: observation.url };
    }
    if (entry.stuckProbability >= 0.7) return { status: "stuck", steps, finalUrl: observation.url };
    if (decision.originViolation || decision.unknownTarget) {
      return { status: "blocked", steps, finalUrl: observation.url };
    }

    try {
      observation = await input.driver.apply(operation);
    } catch (e) {
      // The approved action half-executed and the driver broke: fail closed.
      return { status: "executor_error", steps, finalUrl: observation.url, error: String(e).slice(0, 200) };
    }
  }
  return { status: "budget_exhausted", steps, finalUrl: observation.url };
}
