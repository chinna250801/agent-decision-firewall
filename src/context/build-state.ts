import type { ChangeSet, DecisionState } from "../state/decision-state.js";

/** Bump when the state-text format changes; keeps experiments comparable. */
export const CONTEXT_VERSION = 1;

const MAX_DIFF_CHARS = 800;
const MAX_TOTAL_DIFF_CHARS = 2400;
const MAX_ARGS_JSON_CHARS = 500;

function clip(s: string, max: number): string {
  return s.length <= max ? s : s.slice(0, max) + `… [+${s.length - max} chars]`;
}

function renderChanges(changes: ChangeSet | undefined): string {
  if (!changes) return "(no changes)";
  const parts: string[] = [];
  let budget = MAX_TOTAL_DIFF_CHARS;
  for (const [path, diff] of Object.entries(changes.diffs)) {
    if (budget <= 0) {
      parts.push(`--- ${path}: (omitted, budget exhausted)`);
      continue;
    }
    const body = clip(diff, Math.min(MAX_DIFF_CHARS, budget));
    budget -= body.length;
    parts.push(`--- ${path} ---\n${body}`);
  }
  for (const d of changes.deleted ?? []) parts.push(`(deleted) ${d}`);
  return parts.join("\n") || "(no changes)";
}

/**
 * Flatten the canonical state into one deterministic text block. The same
 * string goes to every model so adapters are comparable byte-for-byte.
 */
export function buildStateText(state: DecisionState): { version: number; text: string } {
  const lines: string[] = [
    "## REQUIREMENT",
    state.requirement.text,
  ];
  if (state.requirement.constraints?.length) {
    lines.push("Constraints:", ...state.requirement.constraints.map((c) => `- ${c}`));
  }
  lines.push(
    "## WORKSPACE",
    `root: ${state.workspace.root}`,
    `branch: ${state.workspace.branch ?? "(unknown)"}`,
    `allowed_paths: ${state.workspace.allowedPaths?.join(", ") ?? "(unrestricted)"}`,
  );
  lines.push("## AGENT", `name: ${state.agent.name}`);
  if (state.agent.explanation) lines.push(`explanation: ${clip(state.agent.explanation, 400)}`);
  lines.push(
    "## PROPOSED ACTION",
    `kind: ${state.action.kind}`,
    `summary: ${state.action.summary}`,
    `target: ${state.action.target ?? "(none)"}`,
    `args: ${clip(JSON.stringify(state.action.args ?? {}), MAX_ARGS_JSON_CHARS)}`,
    "## CHANGES",
    renderChanges(state.changes),
  );
  if (state.history?.priorActions?.length) {
    lines.push("## PRIOR ACTIONS");
    for (const p of state.history.priorActions.slice(-5)) {
      lines.push(`- ${p.decision}: ${p.summary}`);
    }
  }
  return { version: CONTEXT_VERSION, text: lines.join("\n") };
}
