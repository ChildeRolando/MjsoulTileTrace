import {describe,it,expect} from "vitest";
import {Client} from "@modelcontextprotocol/sdk/client/index.js";
import {StdioClientTransport} from "@modelcontextprotocol/sdk/client/stdio.js";
import {fileURLToPath} from "node:url";
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
