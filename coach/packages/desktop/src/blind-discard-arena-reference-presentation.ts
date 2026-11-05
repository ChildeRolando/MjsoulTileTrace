import type { ArenaProviderMessage, ArenaProviderToolDefinition } from "./blind-discard-arena-provider.js";
const REFERENCE = /^(?:arena-ref|arena-case):v1:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export type ArenaReferenceMapping = { original: string; short: string }[];
const walk = (value: unknown, onString: (s: string) => string): unknown => {
  if (typeof value === "string") return onString(value);
  if (Array.isArray(value)) return value.map(x => walk(x, onString));
  if (value !== null && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([k,v]) => [k,walk(v,onString)]));
  return value;
};
export function restoreArenaReferencePayload(user: string, mapping: ArenaReferenceMapping): string {
  const reverse = new Map(mapping.map(x => [x.short,x.original]));
  if (reverse.size !== mapping.length || new Set(mapping.map(x => x.original)).size !== mapping.length) throw new Error("arena_reference_mapping_invalid");
  return JSON.stringify(walk(JSON.parse(user), s => reverse.get(s) ?? s));
}
/** Pure presentation transform; private mapping is not sent to the provider. */
export function compactArenaReferencePresentation(messages: ArenaProviderMessage[], tools: ArenaProviderToolDefinition[], outputSchema: unknown) {
  if (messages.length !== 2 || messages[0]?.role !== "system" || messages[1]?.role !== "user") throw new Error("arena_reference_messages_invalid");
  const original=messages[1].content, payload:unknown=JSON.parse(original);
  if (JSON.stringify(payload)!==original) throw new Error("arena_reference_noncanonical_user_json");
  const reserved=new Set<string>();
  function collect(v:unknown):void { if(typeof v === "string") {reserved.add(v);return} if(Array.isArray(v)){for(const x of v)collect(x);return} if(v!==null&&typeof v==="object")for(const [key,x] of Object.entries(v)){reserved.add(key);collect(x)} }
  // Include all actual request shape keys, even the scalar limits supplied later by the runner.
  const requestShape={messages,tools,outputSchema,requireIsolatedContext:true,maxOutputTokens:0,maxInputBytes:0,maxOutputBytes:0};collect(requestShape);collect(payload);
  let outside=false;walk({system:messages[0],tools,outputSchema},s=>{if(REFERENCE.test(s))outside=true;return s});if(outside)throw new Error("arena_reference_outside_user");
  const forward=new Map<string,string>(), mapping:ArenaReferenceMapping=[];let counter=0;
  const transformed=walk(payload,s=>{if(!REFERENCE.test(s))return s;const existing=forward.get(s);if(existing!==undefined)return existing;let short:string;do{short="~"+(counter++).toString(36)}while(reserved.has(short));forward.set(s,short);reserved.add(short);mapping.push({original:s,short});return short});
  const content=JSON.stringify(transformed);if(restoreArenaReferencePayload(content,mapping)!==original)throw new Error("arena_reference_roundtrip_failed");
  const result: ArenaProviderMessage[]=[messages[0],{role:"user",content}];return {messages:result,mapping};
}
