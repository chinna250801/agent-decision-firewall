import type { ProposedAction, DecisionState } from "../state/decision-state.js";
import type { PageObservation, DomNode } from "./observe.js";

/** A concrete browser operation the agent wants to perform this step. */
export type BrowserOperation =
  | { op: "click"; targetId: string }
  | { op: "type"; targetId: string; text: string }
  | { op: "select"; targetId: string; option: string }
  | { op: "scroll" }
  | { op: "wait" }
  | { op: "stop" };

export interface BrowserStep {
  goal: string;
  observation: PageObservation;
  operation: BrowserOperation;
  /** Why the agent chose this (kept for audit; never trusted for authorization). */
  rationale?: string;
}

export function operationSummary(op: BrowserOperation, obs: PageObservation): string {
  const label = (id: string): string => {
    const node = obs.nodes.find((n) => n.id === id);
    return node ? `${node.role} "${node.label.slice(0, 30)}"` : id;
  };
  switch (op.op) {
    case "click":
      return `click ${label(op.targetId)}`;
    case "type":
      return `type into ${label(op.targetId)}`;
    case "select":
      return `select "${op.option}" in ${label(op.targetId)}`;
    default:
      return op.op;
  }
}

/**
 * Map a browser step onto the canonical ProposedAction so the SAME policy
 * engine evaluates it. Target ids resolve against the observation; unknown ids
 * are suspicious by construction.
 */
export function stepToAction(step: BrowserStep): { action: ProposedAction; unknownTarget: boolean } {
  const { operation, observation } = step;
  const find = (id: string): DomNode | undefined => observation.nodes.find((n) => n.id === id && n.visible);
  let unknownTarget = false;
  let action: ProposedAction;

  if (operation.op === "click") {
    const node = find(operation.targetId);
    if (!node) unknownTarget = true;
    action = { kind: "network", summary: `click ${node?.label ?? operation.targetId}`, target: node?.value, args: { op: "click", targetId: operation.targetId } };
  } else if (operation.op === "type") {
    const node = find(operation.targetId);
    if (!node) unknownTarget = true;
    action = { kind: "network", summary: `type into ${node?.label ?? operation.targetId}`, target: observation.url, args: { op: "type", targetId: operation.targetId, textLength: operation.text.length } };
  } else if (operation.op === "select") {
    const node = find(operation.targetId);
    if (!node) unknownTarget = true;
    action = { kind: "network", summary: `select ${operation.option}`, target: observation.url, args: { op: "select", targetId: operation.targetId } };
  } else {
    action = { kind: "network", summary: operation.op, target: observation.url, args: { op: operation.op } };
  }
  return { action, unknownTarget };
}

/** Build a canonical DecisionState for one browser step (context/v1 format). */
export function stepToState(step: BrowserStep, allowedOrigins: string[]): DecisionState {
  return {
    requirement: { text: `Browser goal: ${step.goal}` },
    workspace: { root: observationOrigin(step.observation), allowedPaths: [] },
    agent: { name: "browser-agent", explanation: step.rationale },
    action: stepToAction(step).action,
    environment: { relevantEnv: { allowed_origins: allowedOrigins.join(",") }, cwd: step.observation.url },
  };
}

function observationOrigin(obs: PageObservation): string {
  try {
    return new URL(obs.url).origin;
  } catch {
    return obs.url;
  }
}
