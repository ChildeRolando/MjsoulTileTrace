/**
 * Strict tokenizer for Tenhou mjloggm documents.
 *
 * Real mjloggm logs (pinned corpus: tests/fixtures/real-logs) are a flat
 * sequence of self-closing tags wrapped in a single non-self-closing
 * <mjloggm ver="2.3">…</mjloggm> root with no text content and no nesting.
 * The tokenizer accepts exactly that shape and nothing else: any deviation
 * (missing root, wrong root, closing tags inside the body, nested elements,
 * text between tags, malformed attributes, trailing garbage) is rejected with
 * tenhou_record_invalid_xml instead of being repaired.
 */
import { TenhouSourceError } from "./errors.js";

export interface MjlogToken {
  /** Tag name, e.g. "INIT", "REACH", "T121" (draw tags carry seat+code). */
  readonly tag: string;
  readonly attrs: Readonly<Record<string, string>>;
}

const ROOT_TAG = "mjloggm";
const TAG_PATTERN =
  /^<([A-Za-z_][A-Za-z0-9_]*)((?:\s+[A-Za-z_][A-Za-z0-9_]*="[^"]*")*)\s*\/>/;
const ATTR_PATTERN = /([A-Za-z_][A-Za-z0-9_]*)="([^"]*)"/g;

/** Tokenize a raw mjloggm document. Throws TenhouSourceError on any deviation. */
export function tokenizeMjlog(raw: string): MjlogToken[] {
  let text = raw;
  // Strip a BOM and normalize newlines; mjloggm tag syntax is ASCII-safe.
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  text = text.replace(/\r\n?/g, "\n").trim();

  const openTag = `<${ROOT_TAG}`;
  if (!text.startsWith(openTag)) {
    throw new TenhouSourceError("tenhou_record_invalid_xml");
  }
  const header = /^<mjloggm((?:\s+[A-Za-z_][A-Za-z0-9_]*="[^"]*")*)\s*>/.exec(
    text,
  );
  if (header === null) {
    // A self-closing root (<mjloggm .../>) carries no events at all.
    throw new TenhouSourceError("tenhou_record_invalid_xml");
  }
  const rootAttrs = parseAttrs(header[1]!);
  const closer = `</${ROOT_TAG}>`;
  if (!text.endsWith(closer)) {
    throw new TenhouSourceError("tenhou_record_invalid_xml");
  }
  const body = text.slice(header[0].length, text.length - closer.length);

  const tokens: MjlogToken[] = [{ tag: ROOT_TAG, attrs: rootAttrs }];
  let rest = body;
  for (;;) {
    // Whitespace between tags is tolerated; any other text content is not.
    rest = rest.replace(/^\s+/, "");
    if (rest.length === 0) break;
    const match = TAG_PATTERN.exec(rest);
    if (match === null || match[1]! === ROOT_TAG) {
      throw new TenhouSourceError("tenhou_record_invalid_xml");
    }
    tokens.push({ tag: match[1]!, attrs: parseAttrs(match[2]!) });
    rest = rest.slice(match[0].length);
  }
  return tokens;
}

function parseAttrs(source: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  ATTR_PATTERN.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = ATTR_PATTERN.exec(source)) !== null) {
    attrs[match[1]!] = match[2]!;
  }
  const residue = source.replace(ATTR_PATTERN, "");
  if (residue.trim() !== "") {
    throw new TenhouSourceError("tenhou_record_invalid_xml");
  }
  return attrs;
}
