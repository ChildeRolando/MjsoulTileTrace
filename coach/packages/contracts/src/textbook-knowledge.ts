import { z } from "zod";

export const TextbookIdSchema = z.string().regex(/^[a-z0-9][a-z0-9-]{0,95}$/);
const Hash = z.string().regex(/^[a-f0-9]{64}$/);
export const TEXTBOOK_LIMITS = Object.freeze({ maxResultBytes: 16_384, maxImageBytes: 512_000, maxCorpusBytes: 2_000_000, maxImages: 128 });
export const TextbookSearchRequestSchema = z.object({
  query: z.string().trim().max(400).describe("Chinese concept query; empty string lists reading units."),
  chapterId: TextbookIdSchema.optional(),
  limit: z.number().int().min(1).max(5).default(3),
}).strict();
export const TextbookReadRequestSchema = z.object({ unitId: TextbookIdSchema }).strict();
export const TextbookFigureRequestSchema = z.object({ figureId: TextbookIdSchema }).strict();
const TileCode = z.string().max(80).regex(/^(?:[0-9]+[mps]|[1-7]+z)*$/);
function tiles(code: string): string[] {
  return [...code.matchAll(/([0-9]+)([mpsz])/g)].flatMap(m => [...m[1]!].map(n => (n === "0" ? "5" : n) + m[2]));
}
export const TextbookDiagramSchema = z.object({
  concealed: TileCode, drawn: TileCode.nullable(), doraDisplay: TileCode,
  hiddenTileCount: z.number().int().min(0).max(13),
  melds: z.array(z.object({kind:z.enum(["chi","pon"]),tiles:TileCode,calledIndex:z.number().int().min(0).max(2)}).strict()).max(4),
  notes: z.string().min(1).max(500),
}).strict().superRefine((d,ctx) => {
  const fail=(message:string)=>ctx.addIssue({code:z.ZodIssueCode.custom,message});
  if(d.drawn!==null && tiles(d.drawn).length!==1)fail("drawn must contain exactly one tile");
  const known=[...tiles(d.concealed),...tiles(d.drawn??""),...d.melds.flatMap(m=>tiles(m.tiles))];
  if(![13,14].includes(known.length+d.hiddenTileCount))fail("diagram must account for 13 or 14 tiles, excluding dora display");
  if(d.drawn!==null && known.length+d.hiddenTileCount!==14)fail("drawn-tile example must account for 14 tiles");
  if([...new Set(known)].some(t=>known.filter(x=>x===t).length>4))fail("more than four copies of a tile");
  for(const m of d.melds){
    const t=tiles(m.tiles).sort();
    if(t.length!==3 || (m.kind==="pon" ? new Set(t).size!==1 : t[0]![1]==="z" || t.some(x=>x[1]!==t[0]![1]) || Number(t[1]![0])!==Number(t[0]![0])+1 || Number(t[2]![0])!==Number(t[0]![0])+2))fail("invalid meld tiles");
  }
});
export const TextbookFigureSchema = z.object({
  figureId: TextbookIdSchema, unitId: TextbookIdSchema, page: z.number().int().positive(),
  caption: z.string().min(1).max(500), imageSha256: Hash,
  transcription: z.object({
    hand: z.string().max(150).optional(), decision: z.string().max(150).optional(), conditions: z.string().max(300).optional(),
    table: z.array(z.tuple([z.string().max(100), z.string().max(1000)])).max(20).optional(),
    diagram: TextbookDiagramSchema.optional(),
  }).strict().nullable(),
  requiresImageForFullExample: z.boolean(),
}).strict();
export const TextbookBlockSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("p"), id: TextbookIdSchema, page: z.number().int().positive(), text: z.string().min(1).max(6000) }).strict(),
  z.object({ type: z.literal("h2"), id: TextbookIdSchema, page: z.number().int().positive(), text: z.string().min(1).max(500) }).strict(),
  z.object({ type: z.literal("list"), id: TextbookIdSchema, page: z.number().int().positive(), items: z.array(z.string().min(1).max(2000)).min(1).max(20) }).strict(),
  z.object({ type: z.literal("figure"), id: TextbookIdSchema, page: z.number().int().positive(), figure: TextbookFigureSchema }).strict(),
]);
export const TextbookUnitSchema = z.object({
  unitId: TextbookIdSchema, chapterId: TextbookIdSchema, title: z.string().min(1).max(160), chapterTitle: z.string().min(1).max(160),
  topics: z.array(z.string().min(1).max(40)).max(12),
  source: z.object({ sourceId: TextbookIdSchema, title: z.string().min(1).max(160), sha256: Hash, pages: z.array(z.number().int().positive()).min(1).max(20) }).strict(),
  translationStatus: z.enum(["existing-chinese-edition-transcribed", "assistant-translated-pending-user-review"]),
  previousUnitId: TextbookIdSchema.nullable(), nextUnitId: TextbookIdSchema.nullable(),
  blocks: z.array(TextbookBlockSchema).min(1).max(40),
}).strict();
const CorpusIdentity = { corpusId: Hash, bodySha256: Hash, reviewStatus: z.literal("text-extraction-accepted-content-review-pending") };
export const TextbookSearchResultSchema = z.object({
  kind: z.literal("search"), ...CorpusIdentity, status: z.enum(["hits", "no_hits"]), previewOnly: z.literal(true),
  chapters: z.array(z.object({ chapterId: TextbookIdSchema, title: z.string().max(160) }).strict()).max(32),
  hits: z.array(z.object({ unitId: TextbookIdSchema, chapterId: TextbookIdSchema, title: z.string().max(160), pages: z.array(z.number().int().positive()).max(20), matchedBlockId: TextbookIdSchema, excerpt: z.string().max(400) }).strict()).max(5),
}).strict();
export const TextbookReadResultSchema = z.object({ kind: z.literal("read"), ...CorpusIdentity, completeArgument: z.literal(true), unit: TextbookUnitSchema }).strict();
export const TextbookFigureResultSchema = z.object({ kind: z.literal("figure"), ...CorpusIdentity, figure: TextbookFigureSchema }).strict();
export const TextbookResultSchema = z.discriminatedUnion("kind", [TextbookSearchResultSchema, TextbookReadResultSchema, TextbookFigureResultSchema]);
export type TextbookUnit = z.infer<typeof TextbookUnitSchema>;
export type TextbookFigure = z.infer<typeof TextbookFigureSchema>;
export interface TextbookKnowledgePort {
  search(input: z.infer<typeof TextbookSearchRequestSchema>, signal?: AbortSignal): Promise<z.infer<typeof TextbookSearchResultSchema>>;
  read(input: z.infer<typeof TextbookReadRequestSchema>, signal?: AbortSignal): Promise<z.infer<typeof TextbookReadResultSchema>>;
  figure(input: z.infer<typeof TextbookFigureRequestSchema>, signal?: AbortSignal): Promise<z.infer<typeof TextbookFigureResultSchema>>;
}
