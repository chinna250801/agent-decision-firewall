/**
 * Observation: a deterministic, text-only view of the page for decision models.
 * Mirrors the jev-browser/WebMCP findings: indexed visible action targets,
 * never screenshots, with clipping to a context budget.
 */
export interface DomNode {
  /** Stable id within this observation (t1, t2...). */
  id: string;
  role: "link" | "button" | "input" | "select" | "checkbox" | "textarea" | "text" | "heading";
  /** Visible text / aria-label. */
  label: string;
  /** Current value for inputs; href origin+path for links. */
  value?: string;
  visible: boolean;
  aboveFold: boolean;
}

export interface PageObservation {
  url: string;
  title: string;
  nodes: DomNode[];
}

export interface ObservationText {
  version: number;
  text: string;
  targetCount: number;
}

const OBSERVATION_VERSION = 1;
const MAX_TARGETS = 40;
const MAX_LABEL = 60;

function clip(s: string): string {
  const one = s.replace(/\s+/g, " ").trim();
  return one.length <= MAX_LABEL ? one : one.slice(0, MAX_LABEL - 1) + "…";
}

/**
 * Render the observation as numbered lines. Actionable targets get stable ids
 * so the chosen action can reference them unambiguously.
 */
export function renderObservation(obs: PageObservation): ObservationText {
  const lines: string[] = [`URL: ${obs.url}`, `TITLE: ${clip(obs.title)}`, "INTERACTIVE TARGETS:"];
  let count = 0;
  for (const node of obs.nodes) {
    if (!node.visible) continue;
    if (node.role === "text" || node.role === "heading") continue;
    if (count >= MAX_TARGETS) {
      lines.push("(further targets omitted)");
      break;
    }
    const fold = node.aboveFold ? "" : " [below-fold]";
    const val = node.value !== undefined ? ` value="${clip(node.value)}"` : "";
    lines.push(`[${node.id}] ${node.role}: "${clip(node.label)}"${val}${fold}`);
    count++;
  }
  if (count === 0) lines.push("(no interactive targets)");
  return { version: OBSERVATION_VERSION, text: lines.join("\n"), targetCount: count };
}
