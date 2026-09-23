import type {
  Answer,
  DecisionModelAdapter,
  DecisionResult,
  EvaluationOptions,
  ModelCapabilities,
} from "./types.js";
import type { FirewallQuestion } from "../questions/types.js";

export interface JevConfig {
  apiKey: string;
  baseUrl?: string; // default https://api.typesafe.ai/v1
  model?: string; // default jev-latest
  timeoutMs?: number;
}

/** Native Jev request/response wire types (docs.typesafe.ai/api). */
type JevQuestion =
  | { type: "noul"; instructions: string; criteria?: { true: string; false: string } }
  | { type: "score"; instructions: string; criteria: string[] }
  | { type: "choice"; instructions: string; criteria: Record<string, string | null> };

type JevAnswer =
  | { type: "noul"; noul: number }
  | { type: "score"; score: number; probabilities: Record<string, number>; confidence: number }
  | { type: "choice"; choice: string; probabilities: Record<string, number>; confidence: number };

interface JevResponse {
  model: string;
  answers: Record<string, JevAnswer>;
  usage?: { input_tokens: number; output_tokens: number };
}

export class JevAdapter implements DecisionModelAdapter {
  name = "jev";
  private cfg: Required<Pick<JevConfig, "apiKey" | "baseUrl" | "model">> & JevConfig;

  constructor(cfg: JevConfig) {
    if (!cfg.apiKey) throw new Error("JevAdapter requires TYPESAFE_API_KEY");
    this.cfg = { baseUrl: "https://api.typesafe.ai/v1", model: "jev-latest", ...cfg };
  }

  capabilities(): ModelCapabilities {
    return { maxChoiceOptions: 255, remote: true, supportsMultilingual: false };
  }

  /** Registry questions → native Jev typed questions. */
  static toJevQuestions(questions: readonly FirewallQuestion[]): Record<string, JevQuestion> {
    const out: Record<string, JevQuestion> = {};
    for (const q of questions) {
      if (q.type === "noul") out[q.id] = { type: "noul", instructions: q.definition };
      else if (q.type === "score") out[q.id] = { type: "score", instructions: q.definition, criteria: q.levels };
      else out[q.id] = { type: "choice", instructions: q.definition, criteria: Object.fromEntries(q.options.map((o) => [o, null])) };
    }
    return out;
  }

  private static toAnswer(id: string, version: number, a: JevAnswer): Answer {
    if (a.type === "noul") return { questionId: id, questionVersion: version, type: "noul", value: a.noul };
    if (a.type === "score") return { questionId: id, questionVersion: version, type: "score", value: a.score, probabilities: a.probabilities, confidence: a.confidence };
    return { questionId: id, questionVersion: version, type: "choice", choice: a.choice, probabilities: a.probabilities, confidence: a.confidence };
  }

  async evaluate(
    state: unknown,
    questions: readonly FirewallQuestion[],
    options?: EvaluationOptions,
  ): Promise<DecisionResult> {
    const start = Date.now();
    const timeoutMs = options?.timeoutMs ?? this.cfg.timeoutMs ?? 10_000;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(`${this.cfg.baseUrl}/systemone`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.cfg.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          state,
          model: this.cfg.model,
          questions: JevAdapter.toJevQuestions(questions),
        }),
        signal: controller.signal,
      });
      if (!res.ok) {
        return this.fail(`jev http ${res.status}`, { kind: "unavailable", message: `jev http ${res.status}` }, start);
      }
      const body = (await res.json()) as JevResponse;
      const answers: Record<string, Answer> = {};
      for (const q of questions) {
        const a = body.answers?.[q.id];
        if (!a) {
          return this.fail(`missing answer for ${q.id}`, { kind: "missing_answer", message: `jev returned no answer for "${q.id}"` }, start);
        }
        answers[q.id] = JevAdapter.toAnswer(q.id, q.version, a);
      }
      return {
        model: this.name,
        modelVersion: body.model,
        answers,
        latencyMs: Date.now() - start,
        tokens: body.usage ? { inputTokens: body.usage.input_tokens, outputTokens: body.usage.output_tokens } : null,
        rawResponse: body,
        error: null,
      };
    } catch (e) {
      const aborted = e instanceof Error && e.name === "AbortError";
      return this.fail(
        String(e),
        aborted
          ? { kind: "timeout", message: `jev timed out after ${timeoutMs}ms` }
          : { kind: e instanceof SyntaxError ? "invalid_json" : "exception", message: String(e) },
        start,
      );
    }
  }

  private fail(raw: string, error: NonNullable<DecisionResult["error"]>, start: number): DecisionResult {
    return {
      model: this.name,
      modelVersion: null,
      answers: {},
      latencyMs: Date.now() - start,
      tokens: null,
      rawResponse: { error: raw },
      error,
    };
  }
}
