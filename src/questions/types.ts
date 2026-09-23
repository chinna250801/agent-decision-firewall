/** Question types map 1:1 to the Jev/Laya primitives. */
export type QuestionType = "noul" | "score" | "choice";

/** Shared fields for every question. */
export interface QuestionBase {
  /** Stable identifier, e.g. "authorized". */
  id: string;
  /** Bumped when wording/criteria change; keeps experiments comparable. */
  version: number;
  type: QuestionType;
  /** Formal definition of what the question decides. */
  definition: string;
  /** Human description for docs and reports. */
  description: string;
  /** What a correct answer looks like (e.g. "1 = destructive"). */
  expectedOutput: string;
  /** How answers are scored in evaluation. */
  evaluationCriteria: string;
}

export interface NoulQuestion extends QuestionBase {
  type: "noul";
}

/** Ordered rubric levels; value is the probability-weighted level index. */
export interface ScoreQuestion extends QuestionBase {
  type: "score";
  levels: string[];
}

export interface ChoiceQuestion extends QuestionBase {
  type: "choice";
  options: string[];
}

export type FirewallQuestion = NoulQuestion | ScoreQuestion | ChoiceQuestion;

/** A frozen registry version: questions + their schema version. */
export interface QuestionRegistry {
  /** Registry schema version, independent of per-question versions. */
  version: number;
  questions: FirewallQuestion[];
}

export const FIREWALL_QUESTION_IDS = [
  "authorized",
  "scope_compliant",
  "destructive",
  "sensitive",
  "suspicious",
  "reversible",
  "risk",
  "requires_confirmation",
] as const;

/** v2 additions: browser-domain questions. */
export const BROWSER_QUESTION_IDS = [
  "step_action",
  "goal_met",
  "stuck",
  "injection_in_page",
] as const;

export const ALL_QUESTION_IDS = [...FIREWALL_QUESTION_IDS, ...BROWSER_QUESTION_IDS] as const;

export type QuestionId = (typeof ALL_QUESTION_IDS)[number];
