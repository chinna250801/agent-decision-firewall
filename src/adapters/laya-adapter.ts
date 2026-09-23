import type {
  Answer,
  DecisionModelAdapter,
  DecisionResult,
  EvaluationOptions,
  ModelCapabilities,
} from "./types.js";
import type { FirewallQuestion } from "../questions/types.js";

export interface LayaConfig {
  /** Base URL of the local Laya sidecar (see sidecars/laya/server.py). */
  baseUrl?: string;
  checkpoint?: "english" | "multilingual" | "typed-decisions";
  timeoutMs?: number;
}

/**
 * Laya wire protocol = same question schema Jev uses, served by the local
 * sidecar (sidecars/laya/server.py) wrapping the `laya` pip package.
 * Connection failures surface as error-as-data so the firewall fails closed.
 */
export class LayaAdapter implements DecisionModelAdapter {
  name = "laya";
  private baseUrl: string;
  private checkpoint: string;
  private timeoutMs: number;

  constructor(cfg: LayaConfig = {}) {
    this.baseUrl = cfg.baseUrl ?? process.env["LAYA_SIDECAR_URL"] ?? "http://127.0.0.1:8770";
    this.checkpoint = cfg.checkpoint ?? "english";
    this.timeoutMs = cfg.timeoutMs ?? 5_000;
  }

  capabilities(): ModelCapabilities {
    // 256-token head budget: Laya degrades on very high-cardinality choices.
    return { maxChoiceOptions: 32, remote: true, supportsMultilingual: true };
  }

  /** Same mapping as Jev: Laya's Python API uses the identical question schema. */
  static toLayaQuestions(questions: readonly FirewallQuestion[]): Record<string, unknown> {
    const out: Record<string, unknown> = {};
    for (const q of questions) {
      if (q.type === "noul") out[q.id] = { type: "noul", instructions: q.definition };
      else if (q.type === "score") out[q.id] = { type: "score", instructions: q.definition, criteria: q.levels };
      else out[q.id] = { type: "choice", instructions: q.definition, criteria: Object.fromEntries(q.options.map((o) => [o, null])) };
    }
    return out;
  }

  async evaluate(
    state: unknown,
    questions: readonly FirewallQuestion[],
    options?: EvaluationOptions,
  ): Promise<DecisionResult> {
    const start = Date.now();
    const timeoutMs = options?.timeoutMs ?? this.timeoutMs;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(`${this.baseUrl}/predict`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          checkpoint: this.checkpoint,
          state,
          questions: LayaAdapter.toLayaQuestions(questions),
        }),
        signal: controller.signal,
      });
      if (!res.ok) {
        return this.fail({ kind: "unavailable", message: `laya sidecar http ${res.status}` }, start);
      }
      const body = (await res.json()) as {
        model: string;
        answers: Record<string, { type: "noul" | "score" | "choice"; noul?: number; score?: number; choice?: string; probabilities?: Record<string, number>; confidence?: number }>;
      };
      const answers: Record<string, Answer> = {};
      for (const q of questions) {
        const a = body.answers?.[q.id];
        if (!a) {
          return this.fail({ kind: "missing_answer", message: `laya returned no answer for "${q.id}"` }, start);
        }
        answers[q.id] = {
          questionId: q.id,
          questionVersion: q.version,
          type: q.type,
          ...(q.type === "choice" ? { choice: a.choice, probabilities: a.probabilities, confidence: a.confidence } : {}),
          ...(q.type === "noul" || q.type === "score" ? { value: q.type === "noul" ? a.noul : a.score } : {}),
        };
      }
      return {
        model: this.name,
        modelVersion: body.model,
        answers,
        latencyMs: Date.now() - start,
        tokens: null,
        rawResponse: body,
        error: null,
      };
    } catch (e) {
      const aborted = e instanceof Error && e.name === "AbortError";
      return this.fail(
        aborted
          ? { kind: "timeout", message: `laya sidecar timed out after ${timeoutMs}ms` }
          : { kind: "unavailable", message: `laya sidecar unreachable: ${String(e)}` },
        start,
      );
    }
  }

  private fail(error: NonNullable<DecisionResult["error"]>, start: number): DecisionResult {
    return {
      model: this.name,
      modelVersion: null,
      answers: {},
      latencyMs: Date.now() - start,
      tokens: null,
      rawResponse: null,
      error,
    };
  }
}
