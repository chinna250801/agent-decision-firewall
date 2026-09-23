/**
 * Adapter contract: every decision model normalizes into these types.
 * Adapters NEVER throw on model failure — they return `error` as data so the
 * firewall can fail closed in exactly one place.
 */

/** Normalized answer for one question, regardless of source model. */
export interface Answer {
  /** Registry question id, e.g. "destructive". */
  questionId: string;
  /** Question version used, for historical comparability. */
  questionVersion: number;
  type: "noul" | "score" | "choice";
  /** noul: yes-probability; score: probability-weighted level index. */
  value?: number;
  /** choice: selected option and full distribution. */
  choice?: string;
  probabilities?: Record<string, number>;
  /** choice/score confidence derived from the distribution. */
  confidence?: number;
}

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
}

/** What went wrong, as data — the firewall turns this into BLOCK. */
export interface AdapterError {
  kind:
    | "unavailable"
    | "timeout"
    | "invalid_json"
    | "schema_mismatch"
    | "missing_answer"
    | "unknown_question"
    | "exception";
  message: string;
}

/** The single normalized result shape from every adapter (spec §4). */
export interface DecisionResult {
  model: string;
  modelVersion: string | null;
  answers: Record<string, Answer>;
  latencyMs: number;
  tokens: TokenUsage | null;
  rawResponse: unknown;
  error: AdapterError | null;
}

export interface ModelCapabilities {
  /** Max options a choice question may have. */
  maxChoiceOptions: number;
  /** Whether the model is remote (network failures possible). */
  remote: boolean;
  supportsMultilingual: boolean;
}

export interface EvaluationOptions {
  /** Abort if evaluation exceeds this many ms. */
  timeoutMs?: number;
  /** Trace id propagated to logs. */
  traceId?: string;
}

export interface DecisionModelAdapter {
  name: string;
  capabilities(): ModelCapabilities;
  evaluate(
    state: unknown,
    questions: readonly { id: string; version: number; type: string }[],
    options?: EvaluationOptions,
  ): Promise<DecisionResult>;
}
