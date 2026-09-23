/**
 * Minimal YAML reader for the registry/dataset/config files in this repo.
 * Supports nested maps, lists of maps/scalars, quoted strings, numbers,
 * booleans, and inline [a, b] arrays. Deep YAML is out of scope on purpose:
 * the files are ours and hand-rolled parsing keeps zero runtime deps.
 */
export type YamlValue =
  | string
  | number
  | boolean
  | null
  | YamlValue[]
  | { [k: string]: YamlValue };

interface Line {
  indent: number;
  text: string;
}

/** Strip a trailing comment (# preceded by whitespace) outside quotes. */
function stripTrailingComment(text: string): string {
  let inSingle = false;
  let inDouble = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!;
    if (ch === "'" && !inDouble) inSingle = !inSingle;
    else if (ch === '"' && !inSingle) inDouble = !inDouble;
    else if (ch === "#" && !inSingle && !inDouble && (i === 0 || text[i - 1] === " " || text[i - 1] === "\t")) {
      return text.slice(0, i).trimEnd();
    }
  }
  return text;
}

function collectLines(text: string): Line[] {
  const out: Line[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const content = stripTrailingComment(raw);
    if (content.trim() === "") continue;
    const indent = content.length - content.trimStart().length;
    out.push({ indent, text: content.trim() });
  }
  return out;
}

function findColon(text: string): number {
  for (let i = 0; i < text.length; i++) {
    if (text[i] === ":" && (i + 1 === text.length || text[i + 1] === " ")) return i;
  }
  return -1;
}

function unquote(s: string): string {
  if (s.length >= 2 && s.startsWith('"') && s.endsWith('"')) {
    return s.slice(1, -1).replace(/\\"/g, '"').replace(/\\\\/g, "\\");
  }
  if (s.length >= 2 && s.startsWith("'") && s.endsWith("'")) {
    return s.slice(1, -1).replace(/''/g, "'");
  }
  return s;
}

function parseScalar(s: string): YamlValue {
  const v = s.trim();
  if (v === "" || v === "null" || v === "~") return null;
  if (v === "true") return true;
  if (v === "false") return false;
  if (/^-?\d+(\.\d+)?$/.test(v)) return Number(v);
  return unquote(v);
}

function parseInlineArray(s: string): YamlValue[] {
  const inner = s.slice(1, -1).trim();
  if (inner === "") return [];
  const items: string[] = [];
  let depth = 0;
  let cur = "";
  for (const ch of inner) {
    if (ch === "[" || ch === "{") depth++;
    if (ch === "]" || ch === "}") depth--;
    if (ch === "," && depth === 0) {
      items.push(cur);
      cur = "";
    } else {
      cur += ch;
    }
  }
  items.push(cur);
  return items.map((i) => parseScalar(i.trim()));
}

function startsList(text: string): boolean {
  return text === "-" || text.startsWith("- ");
}

export function parseYaml(text: string): YamlValue {
  const lines = collectLines(text);
  let pos = 0;

  function peek(): Line | null {
    return pos < lines.length ? lines[pos]! : null;
  }

  function parseNode(minIndent: number): YamlValue {
    const entry = peek();
    if (!entry || entry.indent < minIndent) return null;
    if (startsList(entry.text)) return parseSeq(entry.indent);
    return parseMap(entry.indent);
  }

  function parseSeq(indent: number): YamlValue[] {
    const items: YamlValue[] = [];
    while (true) {
      const entry = peek();
      if (!entry || entry.indent !== indent || !startsList(entry.text)) break;
      const rest = entry.text === "-" ? "" : entry.text.slice(1).trim();
      pos++;
      if (rest === "") {
        items.push(parseNode(indent + 1));
        continue;
      }
      const colon = findColon(rest);
      // A quoted scalar may itself contain ": " (e.g. "none: no effect");
      // only an unquoted key: value pair opens an inline map item.
      if (colon > 0 && !rest.startsWith('"') && !rest.startsWith("'")) {
        // First key of a map item lives on the dash line; remaining keys align
        // two columns deeper ("- id: x" -> keys at indent + 2).
        const map: { [k: string]: YamlValue } = {};
        applyPair(map, rest);
        parseMapEntries(map, indent + 2);
        items.push(map);
      } else {
        items.push(parseScalar(rest));
      }
    }
    return items;
  }

  function applyPair(map: { [k: string]: YamlValue }, text: string): void {
    const colon = findColon(text);
    const key = text.slice(0, colon).trim();
    const valPart = text.slice(colon + 1).trim();
    map[key] = valPart === "" ? null : valueFromScalar(valPart);
  }

  function valueFromScalar(valPart: string): YamlValue {
    if (valPart.startsWith("[") && valPart.endsWith("]")) return parseInlineArray(valPart);
    return parseScalar(valPart);
  }

  function parseMap(indent: number): { [k: string]: YamlValue } {
    const map: { [k: string]: YamlValue } = {};
    parseMapEntries(map, indent);
    return map;
  }

  function parseMapEntries(map: { [k: string]: YamlValue }, indent: number): void {
    while (true) {
      const entry = peek();
      if (!entry || entry.indent !== indent || startsList(entry.text)) break;
      const colon = findColon(entry.text);
      if (colon < 0) break; // not a key line; stop consuming
      pos++;
      const key = entry.text.slice(0, colon).trim();
      const valPart = entry.text.slice(colon + 1).trim();
      if (valPart === "") {
        map[key] = parseNode(indent + 1);
      } else {
        map[key] = valueFromScalar(valPart);
      }
    }
  }

  return parseNode(0);
}
