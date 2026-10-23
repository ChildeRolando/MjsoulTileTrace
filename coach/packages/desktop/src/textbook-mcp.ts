import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import { CallToolResultSchema } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { TEXTBOOK_LIMITS, TextbookSearchRequestSchema, TextbookReadRequestSchema, TextbookFigureRequestSchema,
  TextbookSearchResultSchema, TextbookReadResultSchema, TextbookFigureResultSchema, TextbookResultSchema,
  type TextbookKnowledgePort } from "@riichi-coach/contracts";

export function textbookTools(port: TextbookKnowledgePort) {
  return [
    {name:"search_textbook",description:"搜索中文教材的相关段落；query 为空可浏览目录，chapterId 可限定章节。结果只是定位预览，不是引用依据。随后用 read_textbook 阅读完整论证，不能把搜索片段当成完整条件。",
      schema:TextbookSearchRequestSchema,parameters:{type:"object",additionalProperties:false,properties:{query:{type:"string",maxLength:400},chapterId:{type:"string",pattern:"^[a-z0-9][a-z0-9-]{0,95}$"},limit:{type:"integer",minimum:1,maximum:5,default:3}},required:["query"]},
      call:(input:unknown,signal?:AbortSignal)=>port.search(TextbookSearchRequestSchema.parse(input),signal)},
    {name:"read_textbook",description:"读取一个完整论证单元，包括原有结论、理由、适用条件、例外和牌例引用。返回相邻单元 ID，可继续展开。教材观点不等于当前牌局事实；需要原牌图时调用 view_textbook_figure。",
      schema:TextbookReadRequestSchema,parameters:{type:"object",additionalProperties:false,properties:{unitId:{type:"string",pattern:"^[a-z0-9][a-z0-9-]{0,95}$"}},required:["unitId"]},
      call:(input:unknown,signal?:AbortSignal)=>port.read(TextbookReadRequestSchema.parse(input),signal)},
    {name:"view_textbook_figure",description:"读取已登记的教材牌例原图，并返回已核对的牌编码或表格转录（如有）。仅接受 figureId，不接受文件路径。文字客户端没有收到图片时，不得声称看过原图或补猜缺失牌形。",
      schema:TextbookFigureRequestSchema,parameters:{type:"object",additionalProperties:false,properties:{figureId:{type:"string",pattern:"^[a-z0-9][a-z0-9-]{0,95}$"}},required:["figureId"]},
      call:(input:unknown,signal?:AbortSignal)=>port.figure(TextbookFigureRequestSchema.parse(input),signal)},
  ];
}

export function createTextbookMcpServer(input:{port:TextbookKnowledgePort;image:(id:string,signal?:AbortSignal)=>Promise<Buffer>}) {
  const server=new McpServer({name:"coach-textbook",version:"1.0.0"});
  for(const tool of textbookTools(input.port)) {
    server.registerTool(tool.name,{description:tool.description,inputSchema:tool.schema,
      annotations:{readOnlyHint:true,destructiveHint:false,idempotentHint:true,openWorldHint:false}},async(args:Record<string,unknown>,extra:{signal:AbortSignal})=>{
      try {
        const result=TextbookResultSchema.parse(await tool.call(args,extra.signal)),text=JSON.stringify(result);
        if(Buffer.byteLength(text)>TEXTBOOK_LIMITS.maxResultBytes)throw Error("result_over_budget");
        const content:({type:"text";text:string}|{type:"image";data:string;mimeType:string})[]=[{type:"text",text}];
        if(result.kind==="figure") {
          const bytes=await input.image(result.figure.figureId,extra.signal);
          if(bytes.length>TEXTBOOK_LIMITS.maxImageBytes)throw Error("image_over_budget");
          content.push({type:"image",data:bytes.toString("base64"),mimeType:"image/png"});
        }
        return {content,structuredContent:result};
      } catch {return {isError:true,content:[{type:"text" as const,text:"textbook_request_failed"}]};}
    });
  }
  return server;
}

/** Text port for Arena. Image content is intentionally not smuggled into a text prompt. */
export class TextbookMcpClient implements TextbookKnowledgePort {
  private readonly client=new Client({name:"coach-textbook-client",version:"1.0.0"});
  private closed=false;
  async connect(transport:Transport){await this.client.connect(transport);}
  async close(){if(!this.closed){this.closed=true;await this.client.close();}}
  async listTools(){return this.client.listTools();}
  private async call(name:string,input:Record<string,unknown>,signal?:AbortSignal){
    signal?.throwIfAborted();
    const result=CallToolResultSchema.parse(await this.client.callTool({name,arguments:input},undefined,{...(signal?{signal}:{}),timeout:10_000}));
    if(result.isError)throw Error("textbook_request_failed");
    const raw=result.structuredContent??JSON.parse(result.content.find(c=>c.type==="text")?.text??"null");
    if(Buffer.byteLength(JSON.stringify(raw))>TEXTBOOK_LIMITS.maxResultBytes)throw Error("textbook_result_over_budget");
    return raw;
  }
  async search(input:z.infer<typeof TextbookSearchRequestSchema>,signal?:AbortSignal){return TextbookSearchResultSchema.parse(await this.call("search_textbook",TextbookSearchRequestSchema.parse(input),signal));}
  async read(input:z.infer<typeof TextbookReadRequestSchema>,signal?:AbortSignal){return TextbookReadResultSchema.parse(await this.call("read_textbook",TextbookReadRequestSchema.parse(input),signal));}
  async figure(input:z.infer<typeof TextbookFigureRequestSchema>,signal?:AbortSignal){return TextbookFigureResultSchema.parse(await this.call("view_textbook_figure",TextbookFigureRequestSchema.parse(input),signal));}
}
