import { readFileSync } from "node:fs";
import { parseYaml, type YamlValue } from "./yaml.js";
import { FIREWALL_QUESTION_IDS, ALL_QUESTION_IDS, type FirewallQuestion, type QuestionRegistry } from "./types.js";

function isObj(v: YamlValue): v is { [k: string]: YamlValue } {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function str(v: YamlValue | undefined, field: string): string {
  if (typeof v !== "string" || v === "") throw new Error(`question field "${field}" must be a non-empty string`);
  return v;
}

function num(v: YamlValue | undefined, field: string): number {
  if (typeof v !== "number") throw new Error(`question field "${field}" must be a number`);
  return v;
}

function strArr(v: YamlValue | undefined, field: string): string[] {
  if (!Array.isArray(v) || v.length === 0 || v.some((x) => typeof x !== "string")) {
    throw new Error(`question field "${field}" must be a non-empty string array`);
  }
  return v as string[];
}

function toQuestion(raw: YamlValue): FirewallQuestion {
  if (!isObj(raw)) throw new Error("each question must be a map");
  const id = str(raw["id"], "id");
  if (!(ALL_QUESTION_IDS as readonly string[]).includes(id)) {
    throw new Error(`unknown question id "${id}"`);
  }
  const version = num(raw["version"], "version");
  const type = str(raw["type"], "type");
  const base = {
    id,
    version,
    definition: str(raw["definition"], "definition"),
    description: str(raw["description"], "description"),
    expectedOutput: str(raw["expectedOutput"], "expectedOutput"),
    evaluationCriteria: str(raw["evaluationCriteria"], "evaluationCriteria"),
  };
  if (type === "noul") return { ...base, type };
  if (type === "score") return { ...base, type, levels: strArr(raw["levels"], "levels") };
  if (type === "choice") return { ...base, type, options: strArr(raw["options"], "options") };
  throw new Error(`question "${id}" has unknown type "${type}"`);
}

/** Load and validate a registry file; throws with a clear message on any schema violation. */
export function loadQuestionRegistry(path: string): QuestionRegistry {
  const doc = parseYaml(readFileSync(path, "utf8"));
  if (!isObj(doc)) throw new Error(`${path}: root must be a map`);
  const version = num(doc["version"], "version");
  if (!Array.isArray(doc["questions"])) throw new Error(`${path}: "questions" must be a list`);
  const questions = doc["questions"].map(toQuestion);
  const ids = new Set(questions.map((q) => q.id));
  for (const expected of FIREWALL_QUESTION_IDS) {
    if (!ids.has(expected)) throw new Error(`${path}: missing required question "${expected}"`);
  }
  if (ids.size !== questions.length) throw new Error(`${path}: duplicate question ids`);
  return { version, questions };
}
