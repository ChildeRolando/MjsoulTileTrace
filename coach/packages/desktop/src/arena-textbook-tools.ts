import { z } from "zod";
import { ArenaCaseRefSchema, ArenaOpaqueReferenceSchema, TextbookResultSchema, type TextbookKnowledgePort } from "@riichi-coach/contracts";
import type { ArenaRunnerTool } from "./blind-discard-arena-runner.js";
import type { ArenaRunAliasVault } from "./blind-discard-arena.js";
import { textbookTools } from "./textbook-mcp.js";

const Envelope=z.object({caseRef:ArenaCaseRefSchema,sourceRefs:z.array(ArenaOpaqueReferenceSchema).max(1),
  imageDelivery:z.literal("not-delivered-text-only"),result:TextbookResultSchema}).strict();

/** Assembly only: production Coach defaults, provider modality and grading are unchanged. */
export function createArenaTextbookTools(input:{caseRef:string;aliases:Pick<ArenaRunAliasVault,"reference">;knowledge:TextbookKnowledgePort;dispose?:()=>Promise<void>}):ArenaRunnerTool[]{
  const caseRef=ArenaCaseRefSchema.parse(input.caseRef);
  let disposed=false;
  return textbookTools(input.knowledge).map(tool=>({
    name:tool.name,description:tool.description+" 当前 Arena 只接收文字，图片未传入模型。只能依据正文和非空 transcription；未转录的牌图不能作为已读事实。",parameters:tool.parameters,
    parseInput:raw=>tool.schema.parse(raw),
    async execute(raw,context){
      if(context.caseRef!==caseRef)throw Error("case_mismatch");context.signal.throwIfAborted();
      const result=TextbookResultSchema.parse(await tool.call(raw,context.signal));
      const id=result.kind==="read"?result.unit.unitId:result.kind==="figure"&&result.figure.transcription?result.figure.figureId:null;
      return Envelope.parse({caseRef,result,imageDelivery:"not-delivered-text-only",sourceRefs:id?[input.aliases.reference(`textbook/v1\0${result.corpusId}\0${id}`)]:[]});
    },
    parseOutput(raw){const r=Envelope.parse(raw);if(r.caseRef!==caseRef)throw Error("case_mismatch");return r;},
    references(raw){const r=Envelope.parse(raw);if(r.caseRef!==caseRef)throw Error("case_mismatch");return {evidenceRefs:[],sourceRefs:r.sourceRefs};},
    async dispose(){if(!disposed){disposed=true;await input.dispose?.();}},
  }));
}
