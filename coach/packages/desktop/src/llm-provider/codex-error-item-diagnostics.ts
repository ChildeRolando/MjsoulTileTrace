/** Narrow diagnostic for an already-rejected CLI error item. Never retain raw values. */
export type ErrorItemFieldType = 'missing' | 'null' | 'string' | 'number' | 'boolean' | 'object' | 'array' | 'other';
export type ErrorItemHint = 'resource_limit' | 'authentication' | 'connection' | 'timeout';
export type ErrorItemCode = 'rate_limit_exceeded' | 'insufficient_quota' | 'invalid_api_key' | 'authentication_error' | 'permission_denied' | 'server_error' | 'service_unavailable' | 'timeout' | 'connection_error' | 'unknown';
export type ErrorItemDiagnostic = {
  version: 'arena-error-item-diagnostic/v1';
  fields: { code: ErrorItemFieldType; httpStatus: ErrorItemFieldType; status: ErrorItemFieldType; message: ErrorItemFieldType; text: ErrorItemFieldType; error: ErrorItemFieldType; nestedCode: ErrorItemFieldType; nestedHttpStatus: ErrorItemFieldType; nestedStatus: ErrorItemFieldType; nestedMessage: ErrorItemFieldType; nestedText: ErrorItemFieldType };
  directCode: ErrorItemCode;
  nestedCode: ErrorItemCode;
  httpStatus: number | 'unknown';
  nestedHttpStatus: number | 'unknown';
  statusHttpCode: number | 'unknown';
  nestedStatusHttpCode: number | 'unknown';
  hints: ErrorItemHint[];
  hintsAreVerifiedCause: false;
};
const allowedCodes = new Set<ErrorItemCode>(['rate_limit_exceeded','insufficient_quota','invalid_api_key','authentication_error','permission_denied','server_error','service_unavailable','timeout','connection_error']);
const object = (v: unknown): Record<string,unknown> | undefined => v !== null && typeof v === 'object' && !Array.isArray(v) ? v as Record<string,unknown> : undefined;
const fieldType = (o: Record<string,unknown> | undefined, key: string): ErrorItemFieldType => {
  if (!o || !Object.hasOwn(o,key)) return 'missing';
  const v=o[key]; if (v===null) return 'null'; if (Array.isArray(v)) return 'array';
  const t=typeof v; return t==='string'||t==='number'||t==='boolean'||t==='object' ? t : 'other';
};
const code = (v: unknown): ErrorItemCode => typeof v==='string' && allowedCodes.has(v as ErrorItemCode) ? v as ErrorItemCode : 'unknown';
const http = (v: unknown): number | 'unknown' => typeof v==='number' && Number.isInteger(v) && v>=100 && v<=599 ? v : 'unknown';
/** Only call for type=error; option is explicit and default-off. */
export function errorItemDiagnostic(item: unknown, enabled: boolean): ErrorItemDiagnostic | undefined {
  const o=object(item); if (!enabled || o?.type!=='error') return undefined;
  const nested=object(o.error), hintSet=new Set<ErrorItemHint>();
  for (const v of [o.message,o.text,nested?.message,nested?.text]) {
    if (typeof v!=='string') continue;
    const text=v.slice(0,4096);
    if (/\brate[ _-]?limit(?:ed|ing|s)?\b|\btoo many requests\b/i.test(text)) hintSet.add('resource_limit');
    if (/\bauthentication\b|\bunauthorized\b|\binvalid api key\b/i.test(text)) hintSet.add('authentication');
    if (/\bconnection\b|\bnetwork\b/i.test(text)) hintSet.add('connection');
    if (/\btimeout\b|\btimed out\b/i.test(text)) hintSet.add('timeout');
  }
  return {version:'arena-error-item-diagnostic/v1',fields:{code:fieldType(o,'code'),httpStatus:fieldType(o,'http_status'),status:fieldType(o,'status'),message:fieldType(o,'message'),text:fieldType(o,'text'),error:fieldType(o,'error'),nestedCode:fieldType(nested,'code'),nestedHttpStatus:fieldType(nested,'http_status'),nestedStatus:fieldType(nested,'status'),nestedMessage:fieldType(nested,'message'),nestedText:fieldType(nested,'text')},directCode:code(o.code),nestedCode:code(nested?.code),httpStatus:http(o.http_status),nestedHttpStatus:http(nested?.http_status),statusHttpCode:http(o.status),nestedStatusHttpCode:http(nested?.status),hints:[...hintSet].sort(),hintsAreVerifiedCause:false};
}
