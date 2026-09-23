/**
 * Real-page observation: parse a Chromium accessibility snapshot into the
 * indexed PageObservation the decision models consume. Pure text in → pure
 * observation out, so this is unit-testable without a live browser.
 *
 * Input format: one target per line, as emitted by the Playwright driver:
 *   role="button" name="Add to cart" [focused]?
 *   link "Checkout" href="/checkout"
 *   textbox "Email" value=""
 */
import type { DomNode, PageObservation } from "./observe.js";

export interface SnapshotLine {
  role: DomNode["role"];
  label: string;
  value?: string;
  /** Raw href for links (resolved to origin+path by the driver). */
  href?: string;
  focused?: boolean;
}

const ROLE_RE = /^\s*(?:role=")?(link|button|textbox|combobox|checkbox|heading)"?\s+/;
const LABEL_RE = /^(?:name=)?"((?:[^"\\]|\\.)*)"/;
const BARE_RE = /^(\S+)/;
const ATTR = (name: string) => new RegExp(`\\b${name}="((?:[^"\\\\]|\\\\.)*)"`);

/** Parse one a11y line; returns null for roles we never act on. */
export function parseSnapshotLine(line: string): SnapshotLine | null {
  const roleMatch = line.match(ROLE_RE);
  if (!roleMatch) return null;
  const rawRole = roleMatch[1];
  const after = line.slice(roleMatch[0].length);
  const labelled = after.match(LABEL_RE);
  const label = (labelled?.[1] ?? BARE_RE.exec(after)?.[1] ?? "").replace(/\\"/g, '"').trim();
  const role = rawRole === "textbox" || rawRole === "combobox" ? "input" : (rawRole as DomNode["role"]);
  const value = after.match(ATTR("value"))?.[1]?.replace(/\\"/g, '"');
  const href = after.match(ATTR("href"))?.[1];
  const focused = /\bfocused\b/.test(line);
  return { role, label, value, focused, href };
}

/**
 * Build the observation: visible interactive targets get stable ids (t1, t2…)
 * in DOM order, matching the contract the chooser and stepToAction rely on.
 */
export function observationFromSnapshot(input: {
  url: string;
  title: string;
  lines: string[];
  foldBoundary?: number;
}): PageObservation {
  const nodes: DomNode[] = [];
  let index = 1;
  for (const line of input.lines) {
    const parsed = parseSnapshotLine(line);
    if (!parsed) continue;
    const href = parsed.role === "link" ? parsed.href ?? parsed.value : undefined;
    nodes.push({
      id: `t${index++}`,
      role: parsed.role,
      label: parsed.label,
      value: href ?? parsed.value,
      visible: true,
      aboveFold: nodes.length < (input.foldBoundary ?? 20),
    });
  }
  return { url: input.url, title: input.title, nodes };
}
