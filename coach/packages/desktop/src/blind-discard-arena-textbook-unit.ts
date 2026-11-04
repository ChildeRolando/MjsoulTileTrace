import { createHash } from "node:crypto";
import { z } from "zod";
import { ArenaCaseRefSchema, type ArenaBlindObservation } from "@riichi-coach/contracts";
import { ArenaBasicCalculationsSchema } from "./blind-discard-arena-basic-calculations.js";
import { ARENA_RAW_PROMPT, projectArenaRawObservation } from "./blind-discard-arena-experiment.js";
import { ArenaProviderRequestSchema, ArenaToolCallProviderResultSchema, type ArenaToolCallProvider, type ArenaRequestAudit } from "./blind-discard-arena-provider.js";

export const TEXTBOOK_INDEX_SHA256 = "cc3a7ae683cc009b8c766eb64c4a32b5d48b1aa40db9477ae2cdc150354caa9c";
const hash = (v:string|Uint8Array) => createHash("sha256").update(v).digest("hex");
const Digest = z.string().regex(/^[a-f0-9]{64}$/);
const Source = z.object({sourceId:z.string().min(1),title:z.string().min(1),sha256:Digest,pages:z.array(z.number().int().positive()),format:z.literal("web").optional(),web:z.object({url:z.string().url(),articleId:z.string().min(1),htmlSha256:Digest}).strict().optional()}).strict();
const Unit = z.object({id:z.string().min(1),chapterId:z.string().min(1),title:z.string().min(1),chapterTitle:z.string().min(1),contentRole:z.enum(["instruction","navigation"]),content:z.string().min(1),contentDigest:Digest,source:Source}).strict();
export type WholeUnitLibrary = Readonly<{indexSha256:string; corpusId:string; catalog:readonly {unitId:string;chapterId:string;title:string;chapterTitle:string;role:"instruction"|"navigation";characters:number}[]}>;
const libraries = new WeakMap<object, Map<string,z.infer<typeof Unit>>>();
/** Validate the entire exact frozen index, not a supplied self-hash or truncated unit. */
export function createWholeUnitLibrary(indexBytes:Uint8Array):WholeUnitLibrary {
  if(hash(indexBytes)!==TEXTBOOK_INDEX_SHA256) throw Error("arena_textbook_index_digest_mismatch");
  const index=JSON.parse(new TextDecoder("utf-8",{fatal:true}).decode(indexBytes)) as {version:string;corpusId:string;passages:Record<string,unknown>[];chapters:unknown[];counts:{units:number;chapters:number}};
  if(index.version!=="ceiling-whole-unit-index/v1"||!Digest.safeParse(index.corpusId).success||index.passages.length!==240||index.chapters.length!==232||index.counts.units!==240||index.counts.chapters!==232) throw Error("arena_textbook_index_invalid");
  const units=new Map<string,z.infer<typeof Unit>>(),catalog: Array<WholeUnitLibrary["catalog"][number]>=[];
  for(const v of index.passages){ const unit=Unit.parse({id:v.id,chapterId:v.chapterId,title:v.title,chapterTitle:v.chapterTitle,contentRole:v.contentRole,content:v.content,contentDigest:v.contentDigest,source:v.source});
    if(units.has(unit.id)||hash(unit.content)!==unit.contentDigest) throw Error("arena_textbook_unit_digest_mismatch");units.set(unit.id,unit);catalog.push(Object.freeze({unitId:unit.id,chapterId:unit.chapterId,title:unit.title,chapterTitle:unit.chapterTitle,role:unit.contentRole,characters:[...unit.content].length})); }
  if(catalog.filter(x=>x.role==="instruction").length!==237||catalog.filter(x=>x.role==="navigation").length!==3) throw Error("arena_textbook_role_count_invalid");
  const lib=Object.freeze({indexSha256:TEXTBOOK_INDEX_SHA256,corpusId:index.corpusId,catalog:Object.freeze(catalog)});libraries.set(lib,units);return lib;
}
function unitsFor(library:unknown) { if(typeof library!=="object"||library===null)throw Error("arena_textbook_library_untrusted");const units=libraries.get(library);if(!units)throw Error("arena_textbook_library_untrusted");return units; }
const Selected = z.object({status:z.literal("selected"),caseRef:ArenaCaseRefSchema,indexSha256:Digest,corpusId:Digest,unit:Unit}).strict();
const None = z.object({status:z.literal("none"),caseRef:ArenaCaseRefSchema,indexSha256:Digest,corpusId:Digest}).strict();
const Failure = z.object({status:z.literal("unavailable"),caseRef:ArenaCaseRefSchema,indexSha256:Digest,corpusId:Digest,reason:z.enum(["provider_failure","invalid_response"])}).strict();
export const ArenaWholeUnitFactsSchema=z.discriminatedUnion("status",[Selected,None,Failure]);
export function createWholeUnitFacts(input:{library:WholeUnitLibrary;caseRef:string;selection:{status:"selected";unitId:string}|{status:"none"}|{status:"unavailable";reason:"provider_failure"|"invalid_response"}}){
 const units=unitsFor(input.library),common={caseRef:ArenaCaseRefSchema.parse(input.caseRef),indexSha256:input.library.indexSha256,corpusId:input.library.corpusId};
 if(input.selection.status==="selected"){const unit=units.get(input.selection.unitId);if(!unit||unit.contentRole!=="instruction")throw Error("arena_textbook_unit_unselectable");return ArenaWholeUnitFactsSchema.parse({...common,status:"selected",unit});}
 return ArenaWholeUnitFactsSchema.parse({...common,...input.selection});
}
export function validateWholeUnitFacts(input:{library:unknown;caseRef:string;packet:unknown}){
 const units=unitsFor(input.library),library=input.library as WholeUnitLibrary,p=ArenaWholeUnitFactsSchema.parse(input.packet);
 if(p.caseRef!==input.caseRef||p.indexSha256!==library.indexSha256||p.corpusId!==library.corpusId) throw Error("arena_textbook_binding_mismatch");
 if(p.status==="selected"){const unit=units.get(p.unit.id);if(!unit||unit.contentRole!=="instruction"||JSON.stringify(unit)!==JSON.stringify(p.unit)||hash(p.unit.content)!==p.unit.contentDigest)throw Error("arena_textbook_content_mismatch");}return p;
}
export function parseWholeUnitSelection(raw:unknown,library:WholeUnitLibrary){unitsFor(library);const selected=z.object({unitId:z.string().nullable()}).strict().parse(raw);if(selected.unitId===null)return {status:"none" as const};const unit=unitsFor(library).get(selected.unitId);if(!unit||unit.contentRole!=="instruction")throw Error("arena_textbook_selection_invalid");return {status:"selected" as const,unitId:selected.unitId};}
export function assembleWholeUnitSelector(input:{observation:ArenaBlindObservation;basicCalculations:unknown;library:WholeUnitLibrary}){
 unitsFor(input.library);const basic=ArenaBasicCalculationsSchema.parse(input.basicCalculations),obs=input.observation;
 if(basic.caseRef!==obs.caseRef||JSON.stringify(basic.candidates.map(x=>x.actionRef))!==JSON.stringify(obs.candidates.map(x=>x.actionRef)))throw Error("arena_textbook_selector_binding_mismatch");
 const ids=input.library.catalog.filter(x=>x.role==="instruction").map(x=>x.unitId);
 const messages=[{role:"system" as const,content:"Select at most one instruction unit from the title catalog relevant to this visible riichi-mahjong position. Return only JSON {\"unitId\":string|null}; choose null if none applies. Navigation units are not selectable. Do not provide a discard or rationale. " + ARENA_RAW_PROMPT.replace('Choose one riichi-mahjong discard from the visible position. Return only JSON {"tile":"1m","red":false}.','')},{role:"user" as const,content:JSON.stringify({raw:projectArenaRawObservation(obs),legalCandidates:obs.candidates,basicCalculations:basic,textbookCatalog:input.library.catalog})}];
 return ArenaProviderRequestSchema.parse({messages,tools:[],outputSchema:{type:"object",additionalProperties:false,properties:{unitId:{anyOf:[{type:"string",enum:ids},{type:"null"}]}},required:["unitId"]},requireIsolatedContext:true,maxOutputTokens:32768,maxInputBytes:128*1024,maxOutputBytes:16384,inputProfile:"textbook-selector-v1"});
}

/** One provider turn only; caller owns durable dispatch and timeout. No generated text is forwarded. */
export async function runWholeUnitSelector(input:{observation:ArenaBlindObservation;basicCalculations:unknown;library:WholeUnitLibrary;provider:ArenaToolCallProvider;signal:AbortSignal;onAudit?:(audit:ArenaRequestAudit)=>void}) {
 const request=assembleWholeUnitSelector(input), started=Date.now();
 if(Buffer.byteLength(JSON.stringify(request),"utf8")>request.maxInputBytes || Buffer.byteLength(JSON.stringify({messages:request.messages,tools:request.tools}),"utf8")>request.maxInputBytes) return { selection:{status:"unavailable" as const,reason:"provider_failure" as const},providerStatus:"input_too_large",usage:{status:"unknown" as const},elapsedMs:Date.now()-started };
 try {
  const result=ArenaToolCallProviderResultSchema.parse(await input.provider.request(request,AbortSignal.any([input.signal,AbortSignal.timeout(300_000)]),input.onAudit));
  const usage=result.usage === undefined ? {status:"unknown" as const} : {status:"reported" as const,value:result.usage};
  if(result.status!=="final")return {selection:{status:"unavailable" as const,reason:"provider_failure" as const},providerStatus:result.status, ...("failureCode" in result && result.failureCode ? { failureCode: result.failureCode } : {}), ...(result.reconnectCount ? { reconnectCount: result.reconnectCount } : {}),usage,elapsedMs:Date.now()-started};
  if(result.usage?.outputTokens !== undefined && result.usage.outputTokens > request.maxOutputTokens) return {selection:{status:"unavailable" as const,reason:"provider_failure" as const},providerStatus:"output_token_limit",rawOutput:result.content,usage,elapsedMs:Date.now()-started};
  if(result.outputBytes>request.maxOutputBytes || Buffer.byteLength(result.content,"utf8")>request.maxOutputBytes) return {selection:{status:"unavailable" as const,reason:"provider_failure" as const},providerStatus:"output_too_large",rawOutput:result.content,usage,elapsedMs:Date.now()-started};
  try {const selection=parseWholeUnitSelection(JSON.parse(result.content),input.library);return {selection,providerStatus:"final",rawOutput:result.content,usage,elapsedMs:Date.now()-started};}
  catch{return {selection:{status:"unavailable" as const,reason:"invalid_response" as const},providerStatus:"invalid_response",rawOutput:result.content,usage,elapsedMs:Date.now()-started};}
 } catch {return {selection:{status:"unavailable" as const,reason:"provider_failure" as const},providerStatus:"provider_error",usage:{status:"unknown" as const},elapsedMs:Date.now()-started};}
}
