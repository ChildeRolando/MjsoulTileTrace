import { z } from "zod";

export const TextbookIdSchema = z.string().regex(/^[a-z0-9][a-z0-9-]{0,95}$/);
const Hash = z.string().regex(/^[a-f0-9]{64}$/);
const SourceUrl = z.string().url().max(2000).refine(url => /^https?:\/\//.test(url), "textbook source must use HTTP(S)");
export const TextbookWebLocatorSchema = z.object({
  url: SourceUrl, sourceBlockIds: z.array(z.string().min(1).max(256)).min(1).max(64),
  domPaths: z.array(z.string().min(1).max(500)).min(1).max(64).optional(),
}).strict();
const SourcePosition = { page: z.number().int().positive().nullable(), locator: TextbookWebLocatorSchema.optional() };
export const TEXTBOOK_LIMITS = Object.freeze({ maxResultBytes: 16_384, maxImageBytes: 8_000_000, maxCorpusBytes: 64_000_000, maxImages: 20_000, maxUnits: 8_000 });
export const TextbookSearchRequestSchema = z.object({
  query: z.string().trim().max(400).describe("Chinese concept query; empty string lists reading units."),
  chapterId: TextbookIdSchema.optional(),
  limit: z.number().int().min(1).max(5).default(3),
  offset: z.number().int().nonnegative().optional(),
}).strict();
export const TextbookReadRequestSchema = z.object({ unitId: TextbookIdSchema, blockOffset: z.number().int().nonnegative().optional() }).strict();
export const TextbookCatalogRequestSchema = z.object({ chapterId: TextbookIdSchema.optional(), offset: z.number().int().nonnegative().optional(), limit: z.number().int().min(1).max(20).optional() }).strict();
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
  figureId: TextbookIdSchema, unitId: TextbookIdSchema, ...SourcePosition,
  caption: z.string().min(1).max(500), imageSha256: Hash,
  imageProvenance: z.object({kind:z.literal("derived-source-assets"),method:z.string().min(1).max(160),sourceAssetSha256s:z.array(Hash).min(1).max(100)}).strict().optional(),
  transcription: z.object({
    text: z.string().min(1).max(3500).optional(), hand: z.string().max(150).optional(), decision: z.string().max(150).optional(), conditions: z.string().max(300).optional(),
    table: z.array(z.tuple([z.string().max(100), z.string().max(1000)])).max(20).optional(),
    diagram: TextbookDiagramSchema.optional(),
  }).strict().nullable(),
  requiresImageForFullExample: z.boolean(),
}).strict().superRefine((figure,ctx) => {
  if((figure.page===null)!==Boolean(figure.locator))ctx.addIssue({code:z.ZodIssueCode.custom,message:"figure requires either a physical PDF page or a web locator"});
});
export const TextbookBlockSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("p"), id: TextbookIdSchema, ...SourcePosition, text: z.string().min(1).max(6000), inlineFigures: z.array(TextbookFigureSchema).min(1).max(64).optional() }).strict(),
  z.object({ type: z.literal("h2"), id: TextbookIdSchema, ...SourcePosition, text: z.string().min(1).max(500) }).strict(),
  z.object({ type: z.literal("list"), id: TextbookIdSchema, ...SourcePosition, items: z.array(z.string().min(1).max(2000)).min(1).max(20) }).strict(),
  z.object({ type: z.literal("figure"), id: TextbookIdSchema, ...SourcePosition, figure: TextbookFigureSchema }).strict(),
]);
export const TextbookUnitSchema = z.object({
  unitId: TextbookIdSchema, chapterId: TextbookIdSchema, title: z.string().min(1).max(160), chapterTitle: z.string().min(1).max(160),
  topics: z.array(z.string().min(1).max(40)).max(12),
  source: z.object({ sourceId: TextbookIdSchema, title: z.string().min(1).max(160), sha256: Hash, pages: z.array(z.number().int().positive()).max(800),
    format: z.enum(["pdf", "web"]).optional(),
    web: z.object({ url: SourceUrl, articleId: z.string().min(1).max(160), htmlSha256: Hash }).strict().optional(),
  }).strict(),
  translationStatus: z.enum(["existing-chinese-edition-transcribed", "assistant-translated-pending-user-review", "batch-audited-pending-user-review"]),
  previousUnitId: TextbookIdSchema.nullable(), nextUnitId: TextbookIdSchema.nullable(),
  blocks: z.array(TextbookBlockSchema).min(1).max(5000),
}).strict().superRefine((unit,ctx) => {
  const fail=(message:string)=>ctx.addIssue({code:z.ZodIssueCode.custom,message});
  if(unit.source.format==="web"){
    if(!unit.source.web||unit.source.pages.length||unit.source.web.htmlSha256!==unit.source.sha256)fail("web source requires its true URL/HTML identity and no PDF page numbers");
    for(const block of unit.blocks){
      if(block.page!==null||!block.locator||block.locator.url!==unit.source.web?.url)fail("web block requires its DOM locator and null PDF page");
      if(block.type==="figure"&&(block.figure.page!==null||JSON.stringify(block.figure.locator)!==JSON.stringify(block.locator)))fail("web figure locator must match its block");
      if(block.type==="p")for(const figure of block.inlineFigures??[])if(figure.page!==null||!figure.locator||figure.locator.url!==unit.source.web?.url||figure.locator.sourceBlockIds.some(id=>!block.locator?.sourceBlockIds.includes(id)))fail("inline figure must belong to its web paragraph");
    }
  }else{
    if(!unit.source.pages.length||unit.source.web)fail("PDF source requires physical pages");
    for(const block of unit.blocks)if(block.page===null||!unit.source.pages.includes(block.page)||block.locator)fail("PDF block requires its physical page");
  }
});
const CorpusIdentity = { corpusId: Hash, bodySha256: Hash, reviewStatus: z.enum(["text-extraction-accepted-content-review-pending", "batch-audited-content-review-pending"]) };
export const TextbookSearchResultSchema = z.object({
  kind: z.literal("search"), ...CorpusIdentity, totalHits: z.number().int().nonnegative(), nextOffset: z.number().int().nonnegative().nullable(), status: z.enum(["hits", "no_hits"]), previewOnly: z.literal(true),
  chapters: z.array(z.object({ chapterId: TextbookIdSchema, title: z.string().max(160) }).strict()).max(32),
  hits: z.array(z.object({ unitId: TextbookIdSchema, chapterId: TextbookIdSchema, title: z.string().max(160), pages: z.array(z.number().int().positive()).max(800), sourceUrl: SourceUrl.optional(), matchedBlockId: TextbookIdSchema, excerpt: z.string().max(400) }).strict()).max(5),
}).strict();
export const TextbookReadResultSchema = z.object({ kind: z.literal("read"), ...CorpusIdentity, completeArgument: z.boolean(), unit: TextbookUnitSchema,
  blockOffset: z.number().int().nonnegative(), nextBlockOffset: z.number().int().nonnegative().nullable(), totalBlocks: z.number().int().positive(),
}).strict();
export const TextbookCatalogResultSchema = z.object({ kind: z.literal("catalog"), ...CorpusIdentity,
  scope: z.enum(["chapters", "units"]), total: z.number().int().nonnegative(), offset: z.number().int().nonnegative(), nextOffset: z.number().int().nonnegative().nullable(),
  entries: z.array(z.object({ chapterId: TextbookIdSchema, unitId: TextbookIdSchema.optional(), title: z.string().max(160), sourceId: TextbookIdSchema, pages: z.array(z.number().int().positive()).max(800), sourceUrl: SourceUrl.optional() }).strict()).max(20),
}).strict();
export const TextbookFigureResultSchema = z.object({ kind: z.literal("figure"), ...CorpusIdentity, figure: TextbookFigureSchema }).strict();
export const TextbookResultSchema = z.discriminatedUnion("kind", [TextbookSearchResultSchema, TextbookReadResultSchema, TextbookFigureResultSchema, TextbookCatalogResultSchema]);
export type TextbookUnit = z.infer<typeof TextbookUnitSchema>;
export type TextbookFigure = z.infer<typeof TextbookFigureSchema>;
export interface TextbookKnowledgePort {
  catalog(input: z.infer<typeof TextbookCatalogRequestSchema>, signal?: AbortSignal): Promise<z.infer<typeof TextbookCatalogResultSchema>>;
  search(input: z.infer<typeof TextbookSearchRequestSchema>, signal?: AbortSignal): Promise<z.infer<typeof TextbookSearchResultSchema>>;
  read(input: z.infer<typeof TextbookReadRequestSchema>, signal?: AbortSignal): Promise<z.infer<typeof TextbookReadResultSchema>>;
  figure(input: z.infer<typeof TextbookFigureRequestSchema>, signal?: AbortSignal): Promise<z.infer<typeof TextbookFigureResultSchema>>;
}
