import {describe,it,expect} from "vitest";
import {Client} from "@modelcontextprotocol/sdk/client/index.js";
import {StdioClientTransport} from "@modelcontextprotocol/sdk/client/stdio.js";
import {fileURLToPath} from "node:url";
import {writeFile} from "node:fs/promises";
import {join} from "node:path";
import {fixtureCorpus} from "./fixtures/textbook-fixture.js";
import {textbookCorpusId,validateTextbookCorpus} from "../src/textbook-knowledge.js";
import {TextbookUnitSchema} from "@riichi-coach/contracts";
import {TextbookMcpClient} from "../src/textbook-mcp.js";
import {createArenaTextbookTools} from "../src/arena-textbook-tools.js";
import {runBlindCoachCase} from "../src/blind-discard-arena-runner.js";
import {writeFixtureCorpus,png} from "./fixtures/textbook-fixture.js";
import {makeArenaMcpCase} from "./fixtures/arena-mcp-case.js";
const cli=fileURLToPath(new URL("../../../bin/textbook-mcp-server.mjs",import.meta.url));
const transport=(directory:string)=>new StdioClientTransport({command:process.execPath,args:[cli,directory],stderr:"pipe"});

describe("textbook MCP over real stdio",()=>{
 it("advertises three read-only tools, returns exact native image bytes, and rejects arbitrary files",async()=>{
  const f=await writeFixtureCorpus(),client=new Client({name:"test",version:"1"});
  try{
   await client.connect(transport(f.directory));const {tools}=await client.listTools();expect(tools.map(t=>t.name)).toEqual(["search_textbook","read_textbook","view_textbook_figure","catalog_textbook"]);
   expect(tools.every(t=>t.annotations?.readOnlyHint===true)).toBe(true);
   const result=await client.callTool({name:"view_textbook_figure",arguments:{figureId:"pairs-b2"}});
   expect(result.isError).not.toBe(true);expect(result.content).toEqual(expect.arrayContaining([expect.objectContaining({type:"image",data:png.toString("base64"),mimeType:"image/png"})]));
   const bad=await client.callTool({name:"view_textbook_figure",arguments:{figureId:"../../secret"}});expect(bad.isError).toBe(true);
   const injected=await client.callTool({name:"read_textbook",arguments:{unitId:"pairs-route",path:"secret"}});expect(injected.isError).toBe(true);
  }finally{await client.close();await f.cleanup();}
 });
 it("keeps navigation readable and searchable over real MCP without granting a teaching citation via either body or figure",async()=>{
  const f=await writeFixtureCorpus(),client=new TextbookMcpClient(),c=makeArenaMcpCase(),corpus=fixtureCorpus();
  corpus.units[0]!.contentRole="navigation";corpus.units[0]!.title="七对子章节目录";
  const figure=corpus.units[0]!.blocks[1]!;if(figure.type!=="figure")throw Error("fixture");figure.figure.contentRole="navigation";figure.figure.transcription={text:"教材目录的示意图，非教学论证。"};figure.figure.requiresImageForFullExample=false;
  corpus.units=corpus.units.map(unit=>TextbookUnitSchema.parse(unit));corpus.corpusId=textbookCorpusId(corpus);validateTextbookCorpus(corpus);await writeFile(join(f.directory,"textbook-corpus.json"),JSON.stringify(corpus));
  try{await client.connect(transport(f.directory));const tools=createArenaTextbookTools({caseRef:c.observation.caseRef,aliases:c.aliases,knowledge:client}),context={caseRef:c.observation.caseRef,signal:new AbortController().signal};
   const search=tools.find(t=>t.name==="search_textbook")!,read=tools.find(t=>t.name==="read_textbook")!,view=tools.find(t=>t.name==="view_textbook_figure")!;
   const found=await search.execute({query:"七对子章节目录",limit:2},context);expect(JSON.stringify(found)).toContain("七对子章节目录");
   const body=await read.execute({unitId:"pairs-route"},context);expect(JSON.stringify(body)).toContain('"contentRole":"navigation"');expect(read.references!(body).sourceRefs).toEqual([]);
   const image=await view.execute({figureId:"pairs-b2"},context);expect(view.references!(image).sourceRefs).toEqual([]);
   const instruction=await read.execute({unitId:"open-threat"},context);expect(read.references!(instruction).sourceRefs).toHaveLength(1);
  }finally{await client.close();await f.cleanup();}
 });
 it("assembles actual MCP into Arena search-read-submit, without an external model or Mortal call",async()=>{
  const f=await writeFixtureCorpus(),client=new TextbookMcpClient(),c=makeArenaMcpCase();
  try{
   await client.connect(transport(f.directory));let turn=0,ref="";
   const result=await runBlindCoachCase({observation:c.observation,grading:{binding:c.authorizedCase.binding,reference:{status:"unavailable",reason:"mortal_unavailable"}},
    tools:createArenaTextbookTools({caseRef:c.observation.caseRef,aliases:c.aliases,knowledge:client,dispose:()=>client.close()}),
    provider:{descriptor:()=>({providerId:"test-fixture",model:"scripted-no-model",protocolVersion:"arena-function-call/v1"}),async request(request){
     turn++;let name,args;
     if(turn===1){expect(request.messages[0]).toMatchObject({role:"system",content:expect.stringContaining("read the complete argument")});expect(JSON.stringify(request.messages[0])).not.toContain("the corpus covers");name="search_textbook";args={query:"七对子",limit:1};}
     else if(turn===2){const last=request.messages.at(-1);expect(last?.role).toBe("tool");if(last?.role==="tool")expect(JSON.parse(last.content).data.sourceRefs).toEqual([]);name="read_textbook";args={unitId:"pairs-route"};}
     else{const last=request.messages.at(-1);if(last?.role!=="tool")throw Error("missing result");const r=JSON.parse(last.content).data;ref=r.sourceRefs[0];expect(last.content).toContain("见尽的对子");name="submit_decision";args={caseRef:c.observation.caseRef,actionRef:c.observation.candidates[0]!.actionRef,rationale:"工具装配测试，非真实模型讲解。",evidenceRefs:[],sourceRefs:[ref],mainAlternative:null,uncertainty:"牌图未传给文字客户端。"};}
     return {status:"ready",call:{name,arguments:JSON.stringify(args)},outputBytes:100};
    }},
   });
   expect(result.status,JSON.stringify(result.events.filter(e=>e.type!=="run_started"))).toBe("completed");expect(result.providerTurnCount).toBe(3);expect(ref).toMatch(/^arena-ref:/);
   expect(result.events.filter(e=>e.type==="tool_result")).toHaveLength(2);
  }finally{await client.close();await f.cleanup();}
 });
});
