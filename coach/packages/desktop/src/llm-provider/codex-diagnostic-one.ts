export type DiagnosticOne = { version: "arena-diagnostic-one/v1"; templates: string[]; httpCodes: number[]; osCodes: string[]; stages: { thread: number | null; turn: number | null; visible: number | null; error: number | null; close: number | null } };
/** Observational enums only. Never returns or hashes original text. */
export function diagnosticTemplates(item: unknown): Pick<DiagnosticOne, "templates" | "httpCodes" | "osCodes"> {
  const o = item !== null && typeof item === "object" && !Array.isArray(item) ? item as Record<string, unknown> : {};
  const nested = o.error !== null && typeof o.error === "object" && !Array.isArray(o.error) ? o.error as Record<string,unknown> : {};
  const messages = [o.message, o.text, nested.message, nested.text].filter((x): x is string => typeof x === "string").map(x => x.slice(0,4096));
  const rules: [string,RegExp][] = [["websocket",/websocket/i],["handshake",/handshake/i],["connect",/\bconnect(?:ion|ing|ed)?\b/i],["dns",/\bdns\b|name resolution/i],["tls",/\btls\b|certificate/i],["proxy",/\bproxy\b/i],["stream_disconnect",/stream.{0,30}disconnect/i],["timeout",/timed out|timeout/i],["request_send",/error sending request|failed to send request/i]];
  const templates=rules.filter(([,r])=>messages.some(m=>r.test(m))).map(([name])=>name);
  const httpAllowed = new Set([400,401,403,404,408,409,429,500,502,503,504]);
  const httpCodes=[o.http_status,o.status,nested.http_status,nested.status].filter((n): n is number => typeof n === "number" && httpAllowed.has(n));
  const allowed = ["ECONNRESET","ECONNREFUSED","ETIMEDOUT","ENOTFOUND","EAI_AGAIN"];
  const osCodes=allowed.filter(c=>messages.some(m=>new RegExp("\\b"+c+"\\b").test(m)) || o.code===c || nested.code===c);
  return {templates,httpCodes:[...new Set(httpCodes)].sort((a,b)=>a-b),osCodes};
}
