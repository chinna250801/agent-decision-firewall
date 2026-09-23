import type {
  DecisionModelAdapter,
  DecisionResult,
  EvaluationOptions,
  ModelCapabilities,
} from "./types.js";
import type { Answer } from "./types.js";

export type MockMode = "allow_all" | "block_all" | "confirm_all" | "error";

/** Scriptable deterministic adapter: firewall tests run without Jev/Laya. */
export class MockDecisionAdapter implements DecisionModelAdapter {
  name = "mock";
  private mode: MockMode;

  constructor(mode: MockMode = "allow_all") {
    this.mode = mode;
  }

  capabilities(): ModelCapabilities {
    return { maxChoiceOptions: 255, remote: false, supportsMultilingual: false };
  }

  async evaluate(
    _state: unknown,
    questions: readonly { id: string; version: number; type: string }[],
    _options?: EvaluationOptions,
  ): Promise<DecisionResult> {
    const start = Date.now();
    if (this.mode === "error") {
      return this.result({}, { kind: "unavailable", message: "mock unavailable" }, start);
    }
    const answers: Record<string, Answer> = {};
    for (const q of questions) {
      if (q.type === "noul") {
        const danger = q.id === "destructive" || q.id === "sensitive" || q.id === "suspicious";
        const value =
          this.mode === "allow_all"
            ? danger
              ? 0.01
              : q.id === "requires_confirmation"
                ? 0.07
                : 0.97
            : this.mode === "block_all"
              ? danger
                ? 0.99
                : 0.02
              : q.id === "requires_confirmation"
                ? 0.9
                : 0.5;
        answers[q.id] = { questionId: q.id, questionVersion: q.version, type: "noul", value };
      } else if (q.type === "score") {
        answers[q.id] = {
          questionId: q.id,
          questionVersion: q.version,
          type: "score",
          value: this.mode === "block_all" ? 4 : 1,
        };
      }
    }
    return this.result(answers, null, start);
  }

  private result(
    answers: Record<string, Answer>,
    error: DecisionResult["error"],
    start: number,
  ): DecisionResult {
    return {
      model: this.name,
      modelVersion: "mock-1.0.0",
      answers,
      latencyMs: Date.now() - start,
      tokens: null,
      rawResponse: { mode: this.mode },
      error,
    };
  }
}
