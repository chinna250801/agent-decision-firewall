import { readFileSync } from "node:fs";
import { parseYaml, type YamlValue } from "../questions/yaml.js";
import type { BrowserOperation, BrowserStep } from "./step.js";
import type { PageObservation } from "./observe.js";
import type { ExpectedDecisions } from "../datasets/load.js";

export interface BrowserTestCase {
  id: string;
  category: string;
  step: BrowserStep;
  expected: ExpectedDecisions & { injection_in_page?: boolean; stuck?: boolean; goal_met?: boolean; step_action?: string };
  policyExpectation: "ALLOW" | "ASK" | "BLOCK";
}

function isObj(v: YamlValue | undefined): v is { [k: string]: YamlValue } {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function s(v: YamlValue | undefined, ctx: string): string {
  if (typeof v !== "string") throw new Error(`${ctx}: expected string`);
  return v;
}

function node(v: YamlValue, ctx: string): PageObservation["nodes"][number] {
  const o = v as Record<string, YamlValue | undefined>;
  const role = s(o["role"], `${ctx}.role`) as PageObservation["nodes"][number]["role"];
  return {
    id: s(o["id"], `${ctx}.id`),
    role,
    label: s(o["label"], `${ctx}.label`),
    value: typeof o["value"] === "string" ? o["value"] : undefined,
    visible: o["visible"] !== false,
    aboveFold: o["above_fold"] === true,
  };
}

function observation(v: YamlValue | undefined, ctx: string): PageObservation {
  if (!isObj(v)) throw new Error(`${ctx}: expected map`);
  const o = v as Record<string, YamlValue | undefined>;
  if (!Array.isArray(o["nodes"])) throw new Error(`${ctx}.nodes: expected list`);
  return {
    url: s(o["url"], `${ctx}.url`),
    title: s(o["title"], `${ctx}.title`),
    nodes: o["nodes"].map((n, i) => node(n, `${ctx}.nodes[${i}]`)),
  };
}

function operation(v: YamlValue | undefined, ctx: string): BrowserOperation {
  if (!isObj(v)) throw new Error(`${ctx}: expected map`);
  const o = v as Record<string, YamlValue | undefined>;
  const op = s(o["op"], `${ctx}.op`);
  const target = typeof o["target"] === "string" ? o["target"] : "";
  switch (op) {
    case "click":
      return { op: "click", targetId: target };
    case "type":
      return { op: "type", targetId: target, text: s(o["text"], `${ctx}.text`) };
    case "select":
      return { op: "select", targetId: target, option: s(o["option"], `${ctx}.option`) };
    case "scroll":
      return { op: "scroll" };
    case "wait":
      return { op: "wait" };
    case "stop":
      return { op: "stop" };
    default:
      throw new Error(`${ctx}: unknown op "${op}"`);
  }
}

function expected(v: YamlValue | undefined, ctx: string): BrowserTestCase["expected"] {
  if (!isObj(v)) throw new Error(`${ctx}: expected map`);
  const o = v as Record<string, YamlValue | undefined>;
  const out: BrowserTestCase["expected"] = { ...emptyExpected() };
  for (const [k, val] of Object.entries(o)) {
    if (typeof val === "boolean") (out as unknown as Record<string, unknown>)[k] = val;
    else if (typeof val === "number") (out as unknown as Record<string, unknown>)[k] = val;
    else if (typeof val === "string") (out as unknown as Record<string, unknown>)[k] = val;
  }
  return out;
}

function emptyExpected(): ExpectedDecisions {
  return {
    authorization: false, scope_compliant: false, destructive: false, sensitive: false,
    suspicious: false, reversible: false, requires_confirmation: false, risk: 0,
  };
}

export function loadBrowserDataset(path: string): BrowserTestCase[] {
  const doc = parseYaml(readFileSync(path, "utf8"));
  if (!isObj(doc) || !Array.isArray(doc["cases"])) throw new Error(`${path}: expected cases list`);
  const out: BrowserTestCase[] = [];
  for (const raw of doc["cases"] as { [k: string]: YamlValue }[]) {
    if (!isObj(raw)) continue;
    const id = s(raw["id"], "case id");
    const step: BrowserStep = {
      goal: s(raw["goal"], `${id}.goal`),
      observation: observation(raw["observation"], id),
      operation: operation(raw["operation"], `${id}.operation`),
      rationale: typeof raw["rationale"] === "string" ? raw["rationale"] : undefined,
    };
    const pe = s(raw["policy_expectation"], `${id}.policy_expectation`);
    if (!["ALLOW", "ASK", "BLOCK"].includes(pe)) throw new Error(`${id}: invalid policy_expectation`);
    out.push({
      id,
      category: typeof raw["category"] === "string" ? raw["category"] : "web_unknown",
      step,
      expected: expected(raw["expected"], id),
      policyExpectation: pe as BrowserTestCase["policyExpectation"],
    });
  }
  return out;
}
