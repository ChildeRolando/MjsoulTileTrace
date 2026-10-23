import { createHash } from "node:crypto";
import { readFile, realpath, stat } from "node:fs/promises";
import { join, relative, isAbsolute, sep } from "node:path";
import { z } from "zod";
import {
  TEXTBOOK_LIMITS, TextbookIdSchema, TextbookUnitSchema, TextbookSearchRequestSchema,
  TextbookReadRequestSchema, TextbookFigureRequestSchema, TextbookSearchResultSchema,
  TextbookReadResultSchema, TextbookFigureResultSchema, TextbookCatalogRequestSchema, TextbookCatalogResultSchema, type TextbookKnowledgePort,
} from "@riichi-coach/contracts";
import { tokenize } from "./blind-discard-arena-rag.js";

const hash = (value: string | Buffer) => createHash("sha256").update(value).digest("hex");
const Hash = z.string().regex(/^[a-f0-9]{64}$/);
export const TextbookCorpusSchema = z.object({
  schema: z.literal("coach-textbook-corpus/1"), corpusId: Hash, bodySha256: Hash,
  reviewStatus: z.enum(["text-extraction-accepted-content-review-pending", "batch-audited-content-review-pending"]),
  units: z.array(TextbookUnitSchema).min(1).max(TEXTBOOK_LIMITS.maxUnits),
  images: z.array(z.object({ figureId: TextbookIdSchema, path: z.string().regex(/^assets\/[a-z0-9-]+\.png$/), sha256: Hash }).strict()).max(TEXTBOOK_LIMITS.maxImages),
}).strict();
export type TextbookCorpus = z.infer<typeof TextbookCorpusSchema>;
export function textbookCorpusId(c: Pick<TextbookCorpus, "bodySha256" | "units" | "images">): string {
  return hash(JSON.stringify({ bodySha256: c.bodySha256, units: c.units, images: c.images }));
}
export function validateTextbookCorpus(raw: unknown): TextbookCorpus {
  const c = TextbookCorpusSchema.parse(raw);
  if (c.corpusId !== textbookCorpusId(c)) throw Error("textbook_corpus_changed");
  const unitMap = new Map(c.units.map(u => [u.unitId,u]));
  const units = new Set(c.units.map(u => u.unitId)), figures = new Map(c.images.map(i => [i.figureId, i]));
  const blocks = new Set<string>();
  if (units.size !== c.units.length || figures.size !== c.images.length) throw Error("textbook_duplicate_id");
  let imageCount = 0;
  for (const u of c.units) {
    for (const id of [u.previousUnitId, u.nextUnitId]) if (id && unitMap.get(id)?.chapterId!==u.chapterId) throw Error("textbook_neighbor_missing");
    for (const b of u.blocks) {
      if (blocks.has(b.id) || !u.source.pages.includes(b.page)) throw Error("textbook_block_binding");
      blocks.add(b.id);
      if (b.type === "figure") {
        imageCount++;
        if (b.id !== b.figure.figureId || b.figure.unitId !== u.unitId || b.page !== b.figure.page || figures.get(b.id)?.sha256 !== b.figure.imageSha256) throw Error("textbook_image_binding");
      }
    }
    // Leave room for the Arena run-local citation envelope; never trim a parent's conditions.
    for (const block of u.blocks) if (Buffer.byteLength(JSON.stringify({...u,blocks:[block]})) > TEXTBOOK_LIMITS.maxResultBytes - 1500) throw Error("textbook_block_over_budget");
  }
  if (imageCount !== figures.size) throw Error("textbook_orphan_image");
  return c;
}
// Separate "10巡" / "4饼" just as the printed source's "10 巡" / "4 饼".
// This adapter normalization leaves the existing Arena card retriever unchanged.
const normalized = (text: string) => text.normalize("NFKC").replaceAll("筒", "饼").replaceAll("對", "对").replace(/七对(?!子)/g,"七对子").replace(/chiitoitsu/gi,"七对子").replace(/toitoi/gi,"对对和")
  .replace(/([\p{N}A-Za-z])(?=\p{Script=Han})/gu,"$1 ").replace(/(\p{Script=Han})(?=[\p{N}A-Za-z])/gu,"$1 ");
function blockText(b: TextbookCorpus["units"][number]["blocks"][number]): string {
  if (b.type === "figure") return [b.figure.caption, b.figure.transcription?.text, b.figure.transcription?.hand, b.figure.transcription?.decision, b.figure.transcription?.conditions, b.figure.transcription?.table?.flat().join(" "), b.figure.transcription?.diagram && JSON.stringify(b.figure.transcription.diagram)].filter(Boolean).join(" ");
  return b.type === "list" ? b.items.join("\n") : b.text;
}
export function createTextbookKnowledge(raw: unknown): TextbookKnowledgePort {
  const corpus = validateTextbookCorpus(raw);
  const identity = { corpusId: corpus.corpusId, bodySha256: corpus.bodySha256, reviewStatus: corpus.reviewStatus };
  const units = new Map(corpus.units.map(u=>[u.unitId,u]));
  const figures = new Map(corpus.units.flatMap(u=>u.blocks.flatMap(b=>b.type==="figure"?[[b.id,b.figure] as const]:[])));
  const chapterMap=new Map<string,{chapterId:string;title:string;sourceId:string;pages:number[]}>();
  const chapterPageSets=new Map<string,Set<number>>();
  for(const u of corpus.units){
    if(!chapterMap.has(u.chapterId)){chapterMap.set(u.chapterId,{chapterId:u.chapterId,title:u.chapterTitle,sourceId:u.source.sourceId,pages:[]});chapterPageSets.set(u.chapterId,new Set());}
    const pages=chapterPageSets.get(u.chapterId)!;for(const page of u.source.pages)pages.add(page);
  }
  const chapters=[...chapterMap.values()].map(c=>({...c,pages:[...chapterPageSets.get(c.chapterId)!].sort((a,b)=>a-b)}));
  const indexed=corpus.units.map(u=>({u,title:new Set(tokenize(normalized(u.title+" "+u.chapterTitle+" "+u.topics.join(" ")))),blocks:u.blocks.map(b=>({id:b.id,text:blockText(b),tokens:new Set(tokenize(normalized(blockText(b))))}))}));
  return {
    async catalog(input,signal){
      signal?.throwIfAborted();const q=TextbookCatalogRequestSchema.parse(input),offset=q.offset??0,limit=q.limit??20;
      if(q.chapterId&&!chapters.some(c=>c.chapterId===q.chapterId))throw Error("textbook_chapter_not_found");
      const entries=q.chapterId?corpus.units.filter(u=>u.chapterId===q.chapterId).map(u=>({chapterId:u.chapterId,unitId:u.unitId,title:u.title,sourceId:u.source.sourceId,pages:u.source.pages})):chapters;
      if(offset>entries.length)throw Error("textbook_cursor_out_of_range");
      const selected:typeof entries=[];
      const response=()=>({kind:"catalog" as const,...identity,scope:q.chapterId?"units":"chapters",total:entries.length,offset,nextOffset:offset+selected.length<entries.length?offset+selected.length:null,entries:selected});
      for(const entry of entries.slice(offset,offset+limit)){selected.push(entry);if(Buffer.byteLength(JSON.stringify(response()))>TEXTBOOK_LIMITS.maxResultBytes-1500){selected.pop();break;}}
      if(!selected.length&&offset<entries.length)throw Error("textbook_catalog_entry_over_budget");
      return TextbookCatalogResultSchema.parse(response());
    },
    async search(input, signal) {
      signal?.throwIfAborted();
      const q=TextbookSearchRequestSchema.parse(input), terms=tokenize(normalized(q.query));
      if(q.chapterId && !corpus.units.some(u=>u.chapterId===q.chapterId)) throw Error("textbook_chapter_not_found");
      const ranked=indexed.filter(({u})=>!q.chapterId||u.chapterId===q.chapterId).map(({u,title,blocks})=>{
        const best=blocks.map(b=>({id:b.id,text:b.text,score:terms.reduce((n,t)=>n+(b.tokens.has(t)?2:0),0)})).sort((a,b)=>b.score-a.score)[0]!;
        return {u,best,score:best.score+terms.reduce((n,t)=>n+(title.has(t)?1:0),0)};
      }).filter(x=>!q.query||x.score>0).sort((a,b)=>b.score-a.score||a.u.unitId.localeCompare(b.u.unitId));
      const offset=q.offset??0;if(offset>ranked.length)throw Error("textbook_cursor_out_of_range");
      const hits:z.infer<typeof TextbookSearchResultSchema>["hits"]=[];
      const response=()=>({kind:"search" as const,...identity,status:hits.length?"hits":"no_hits",previewOnly:true,totalHits:ranked.length,nextOffset:offset+hits.length<ranked.length?offset+hits.length:null,chapters:[...new Map(hits.map(h=>[h.chapterId,{chapterId:h.chapterId,title:units.get(h.unitId)!.chapterTitle}])).values()],hits});
      for(const {u,best} of ranked.slice(offset,offset+q.limit)){hits.push({unitId:u.unitId,chapterId:u.chapterId,title:u.title,pages:u.source.pages,matchedBlockId:best.id,excerpt:best.text.slice(0,400)});if(Buffer.byteLength(JSON.stringify(response()))>TEXTBOOK_LIMITS.maxResultBytes-1500){hits.pop();break;}}
      if(!hits.length&&offset<ranked.length)throw Error("textbook_search_entry_over_budget");
      return TextbookSearchResultSchema.parse(response());
    },
    async read(input,signal) {
      signal?.throwIfAborted();const q=TextbookReadRequestSchema.parse(input),unit=units.get(q.unitId);
      if(!unit)throw Error("textbook_unit_not_found");
      const offset=q.blockOffset??0;if(offset>=unit.blocks.length)throw Error("textbook_cursor_out_of_range");
      const blocks:typeof unit.blocks=[];
      const response=()=>({kind:"read" as const,...identity,completeArgument:offset===0&&blocks.length===unit.blocks.length,unit:{...unit,blocks},blockOffset:offset,nextBlockOffset:offset+blocks.length<unit.blocks.length?offset+blocks.length:null,totalBlocks:unit.blocks.length});
      for(const block of unit.blocks.slice(offset)){blocks.push(block);if(Buffer.byteLength(JSON.stringify(response()))>TEXTBOOK_LIMITS.maxResultBytes-1500){blocks.pop();break;}}
      if(!blocks.length)throw Error("textbook_block_over_budget");
      return TextbookReadResultSchema.parse(response());
    },
    async figure(input,signal) {
      signal?.throwIfAborted();const q=TextbookFigureRequestSchema.parse(input),figure=figures.get(q.figureId);
      if(!figure)throw Error("textbook_figure_not_found");
      return TextbookFigureResultSchema.parse({kind:"figure",...identity,figure});
    },
  };
}

/** Trusted host config selects a root once. Model requests can only select registered IDs. */
export async function loadTextbookKnowledge(directory: string) {
  const root=await realpath(directory);
  async function bounded(path:string,limit:number) {
    const full=await realpath(join(root,path)),rel=relative(root,full);
    if(isAbsolute(rel)||rel===".."||rel.startsWith(".."+sep))throw Error("textbook_path_outside_root");
    const s=await stat(full);if(!s.isFile()||s.size>limit)throw Error("textbook_file_over_budget");
    const bytes=await readFile(full);if(bytes.length>limit)throw Error("textbook_file_over_budget");return bytes;
  }
  const corpus=validateTextbookCorpus(JSON.parse((await bounded("textbook-corpus.json",TEXTBOOK_LIMITS.maxCorpusBytes)).toString("utf8")));
  if(hash(await bounded("textbook-bodies.json",TEXTBOOK_LIMITS.maxCorpusBytes))!==corpus.bodySha256)throw Error("textbook_body_changed_rebuild_index");
  // Images stay on disk. Every requested image is checked against this corpus snapshot.
  const images=new Map(corpus.images.map(i=>[i.figureId,i]));
  return {port:createTextbookKnowledge(corpus),corpusId:corpus.corpusId,async image(figureId:string,signal?:AbortSignal){
    signal?.throwIfAborted();const record=images.get(TextbookIdSchema.parse(figureId));if(!record)throw Error("textbook_figure_not_found");
    const bytes=await bounded(record.path,TEXTBOOK_LIMITS.maxImageBytes);signal?.throwIfAborted();
    if(bytes.subarray(0,8).toString("hex")!=="89504e470d0a1a0a"||hash(bytes)!==record.sha256)throw Error("textbook_image_changed");return bytes;
  }};
}
