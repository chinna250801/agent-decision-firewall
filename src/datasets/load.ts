import { readFileSync } from "node:fs";
import { parseYaml, type YamlValue } from "../questions/yaml.js";
import type { ActionKind, DecisionState } from "../state/decision-state.js";

export interface ExpectedDecisions {
  authorization: boolean;
  scope_compliant: boolean;
  destructive: boolean;
  sensitive: boolean;
  suspicious: boolean;
  reversible: boolean;
  requires_confirmation: boolean;
  risk: number;
}

export interface TestCase {
  id: string;
  category: string;
  state: DecisionState;
  expected: ExpectedDecisions;
  /** ALLOW | ASK | BLOCK the firewall should reach end-to-end. */
  policyExpectation: "ALLOW" | "ASK" | "BLOCK";
}

function isObj(v: YamlValue | undefined): v is { [k: string]: YamlValue } {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function s(v: YamlValue | undefined, ctx: string): string {
  if (typeof v !== "string") throw new Error(`${ctx}: expected string`);
  return v;
}

function expectedOf(raw: YamlValue | undefined, ctx: string): ExpectedDecisions {
  if (!isObj(raw)) throw new Error(`${ctx}: missing expected block`);
  const e = raw as Record<string, YamlValue | undefined>;
  const bool = (k: string): boolean => {
    if (typeof e[k] !== "boolean") throw new Error(`${ctx}.expected.${k}: expected boolean`);
    return e[k] as boolean;
  };
  if (typeof e["risk"] !== "number") throw new Error(`${ctx}.expected.risk: expected number`);
  return {
    authorization: bool("authorization"),
    scope_compliant: bool("scope_compliant"),
    destructive: bool("destructive"),
    sensitive: bool("sensitive"),
    suspicious: bool("suspicious"),
    reversible: bool("reversible"),
    requires_confirmation: bool("requires_confirmation"),
    risk: e["risk"] as number,
  };
}

/** Map dataset case YAML into the canonical DecisionState (single source of truth). */
export function caseToState(raw: { [k: string]: YamlValue }): DecisionState {
  const ws = isObj(raw["workspace"]) ? raw["workspace"]! : {};
  const agent = isObj(raw["agent"]) ? raw["agent"]! : {};
  const action = isObj(raw["action"]) ? raw["action"]! : {};
  const wsObj = ws as Record<string, YamlValue | undefined>;
  const agentObj = agent as Record<string, YamlValue | undefined>;
  const actionObj = action as Record<string, YamlValue | undefined>;
  const changes = isObj(raw["changes"]) ? raw["changes"] as Record<string, YamlValue | undefined> : undefined;
  return {
    requirement: { text: s(raw["requirement"], "requirement") },
    workspace: {
      root: typeof wsObj["root"] === "string" ? wsObj["root"] : "/repo",
      allowedPaths: Array.isArray(wsObj["allowed_paths"]) ? wsObj["allowed_paths"] as string[] : undefined,
    },
    agent: {
      name: typeof agentObj["name"] === "string" ? agentObj["name"] : "unknown",
      explanation: typeof agentObj["explanation"] === "string" ? agentObj["explanation"] : undefined,
    },
    action: {
      kind: (typeof actionObj["kind"] === "string" ? actionObj["kind"] : "unknown") as ActionKind,
      summary: s(actionObj["summary"], "action.summary"),
      target: typeof actionObj["target"] === "string" ? actionObj["target"] : undefined,
      args: isObj(actionObj["args"]) ? actionObj["args"] as Record<string, unknown> : undefined,
    },
    ...(changes
      ? {
          changes: {
            diffs: Object.fromEntries(
              Object.entries(changes["diffs"] as Record<string, YamlValue | undefined> ?? {}).filter(
                (pair): pair is [string, string] => typeof pair[1] === "string",
              ),
            ),
          },
        }
      : {}),
  };
}

export function loadDataset(path: string): TestCase[] {
  const doc = parseYaml(readFileSync(path, "utf8"));
  if (!isObj(doc) || !Array.isArray(doc["cases"])) throw new Error(`${path}: expected top-level cases list`);
  const out: TestCase[] = [];
  for (const raw of doc["cases"] as { [k: string]: YamlValue }[]) {
    if (!isObj(raw)) throw new Error(`${path}: each case must be a map`);
    const id = s(raw["id"], "case id");
    const expected = expectedOf(raw["expected"], id);
    const pe = s(raw["policy_expectation"], `${id}.policy_expectation`);
    if (!["ALLOW", "ASK", "BLOCK"].includes(pe)) throw new Error(`${id}: invalid policy_expectation "${pe}"`);
    out.push({
      id,
      category: typeof raw["category"] === "string" ? raw["category"] : "unknown",
      state: caseToState(raw),
      expected,
      policyExpectation: pe as TestCase["policyExpectation"],
    });
  }
  return out;
}
