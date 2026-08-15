// The privileged boundary for untrusted Mortal (mjai-reviewer) result URLs.
//
// Only the exact approved HTTPS host with the exact report-path shape is
// accepted: no userinfo, no explicit port, no query, no hash, bounded
// length. The result URL is privacy-sensitive (it addresses a real person's
// reviewed game) — it is never logged and never enters product diagnostics.

export const MORTAL_REPORT_APPROVED_HOSTS: readonly string[] = Object.freeze([
  "mjai.ekyu.moe",
]);

export const MORTAL_REPORT_URL_MAX_LENGTH = 256;
const REPORT_ID_PATTERN = /^[0-9a-f]{16}$/u;

export type MortalReportResultUrl =
  | {
    readonly status: "valid";
    readonly reportId: string;
    readonly approvedHost: string;
  }
  | { readonly status: "invalid" };

export function parseMortalReportResultUrl(value: string): MortalReportResultUrl {
  if (
    typeof value !== "string"
    || value.length === 0
    || value.length > MORTAL_REPORT_URL_MAX_LENGTH
  ) {
    return { status: "invalid" };
  }
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return { status: "invalid" };
  }
  const host = url.hostname.toLowerCase();
  // URL normalizes away an explicit default port (https://host:443), so the
  // raw authority must be checked directly to reject any port or userinfo.
  const rawAuthority = /^https:\/\/([^/?#]+)/u.exec(value)?.[1] ?? "";
  if (
    url.protocol !== "https:"
    || url.username !== ""
    || url.password !== ""
    || url.port !== ""
    || rawAuthority.includes("@")
    || rawAuthority.includes(":")
    || url.search !== ""
    || url.hash !== ""
    || !MORTAL_REPORT_APPROVED_HOSTS.includes(host)
  ) {
    return { status: "invalid" };
  }
  // The viewer page (…/killerducky/?data=/report/<id>.json) is NOT a result
  // URL; only the canonical JSON endpoint is accepted.
  const match = /^\/report\/([0-9a-f]{16})\.json$/u.exec(url.pathname);
  if (match === null) {
    return { status: "invalid" };
  }
  return Object.freeze({
    status: "valid" as const,
    reportId: match[1]!,
    approvedHost: host,
  });
}
