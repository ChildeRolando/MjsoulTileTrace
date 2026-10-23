import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import { CallToolResultSchema } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { TEXTBOOK_LIMITS, TextbookSearchRequestSchema, TextbookReadRequestSchema, TextbookFigureRequestSchema,
  TextbookSearchResultSchema, TextbookReadResultSchema, TextbookFigureResultSchema, TextbookResultSchema, TextbookCatalogRequestSchema, TextbookCatalogResultSchema,
  type TextbookKnowledgePort } from "@riichi-coach/contracts";

export function textbookTools(port: TextbookKnowledgePort) {
  return [
    {name:"search_textbook",description:"搜索中文教材的相关段落；query 为空仅返回前几个定位项；完整目录请用 catalog_textbook 分页浏览，chapterId 可限定章节。nextOffset可继续结果列表。结果只是定位预览，不是引用依据。随后用 read_textbook 阅读完整论证，不能把搜索片段当成完整条件。",
      schema:TextbookSearchRequestSchema,parameters:{type:"object",additionalProperties:false,properties:{query:{type:"string",maxLength:400},chapterId:{type:"string",pattern:"^[a-z0-9][a-z0-9-]{0,95}$"},limit:{type:"integer",minimum:1,maximum:5,default:3},offset:{type:"integer",minimum:0}},required:["query"]},
      call:(input:unknown,signal?:AbortSignal)=>port.search(TextbookSearchRequestSchema.parse(input),signal)},
    {name:"read_textbook",description:"读取论证、条件、例外、牌例转录及相邻单元ID。长论证通过 nextBlockOffset 连续读取，直到为 null，按块序拼接才是全文；completeArgument=false 表示本次只是部分，不得把单页当作全部条件。牌编码m/p/s/z=万/饼/索/字，1–7z=东南西北白发中，0=赤五。diagram.concealed不含单列drawn摸牌和melds副露；hiddenTileCount为未知牌背数；副露tiles保留原图顺序，calledIndex是横置牌零基序号；doraDisplay原样记录宝牌栏，不是指示牌或手牌，重复图标不代表加倍宝牌。notes保留图示条件，教材假设暗手不是局面已知事实。可用view_textbook_figure看原图。",
      schema:TextbookReadRequestSchema,parameters:{type:"object",additionalProperties:false,properties:{unitId:{type:"string",pattern:"^[a-z0-9][a-z0-9-]{0,95}$"},blockOffset:{type:"integer",minimum:0}},required:["unitId"]},
      call:(input:unknown,signal?:AbortSignal)=>port.read(TextbookReadRequestSchema.parse(input),signal)},
    {name:"view_textbook_figure",description:"读取教材牌例原图及已核对文字转录。diagram 中 m/p/s/z=万/饼/索/字，1–7z=东南西北白发中，0=赤五；concealed不含摸牌/副露，drawn为单独摸牌；hiddenTileCount是未知暗手张数，不得补猜。melds按原图顺序，calledIndex为横置牌零基序号；doraDisplay为宝牌栏原样转录（不是指示牌或手牌，重复图标不代表加倍宝牌）。notes保留原图/正文条件。仅接受figureId。文字客户端可读转录，但不得声称看过未收到的图片。",
      schema:TextbookFigureRequestSchema,parameters:{type:"object",additionalProperties:false,properties:{figureId:{type:"string",pattern:"^[a-z0-9][a-z0-9-]{0,95}$"}},required:["figureId"]},
      call:(input:unknown,signal?:AbortSignal)=>port.figure(TextbookFigureRequestSchema.parse(input),signal)},
    {name:"catalog_textbook",description:"分页浏览全部教材章节；指定 chapterId 后分页列出该章的完整阅读单元。继续使用 nextOffset，直到为 null。目录是索引，不是知识引用。",
      schema:TextbookCatalogRequestSchema,parameters:{type:"object",additionalProperties:false,properties:{chapterId:{type:"string",pattern:"^[a-z0-9][a-z0-9-]{0,95}$"},offset:{type:"integer",minimum:0},limit:{type:"integer",minimum:1,maximum:20}}},
      call:(input:unknown,signal?:AbortSignal)=>port.catalog(TextbookCatalogRequestSchema.parse(input),signal)},
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
  async catalog(input:z.infer<typeof TextbookCatalogRequestSchema>,signal?:AbortSignal){return TextbookCatalogResultSchema.parse(await this.call("catalog_textbook",TextbookCatalogRequestSchema.parse(input),signal));}
  async search(input:z.infer<typeof TextbookSearchRequestSchema>,signal?:AbortSignal){return TextbookSearchResultSchema.parse(await this.call("search_textbook",TextbookSearchRequestSchema.parse(input),signal));}
  async read(input:z.infer<typeof TextbookReadRequestSchema>,signal?:AbortSignal){return TextbookReadResultSchema.parse(await this.call("read_textbook",TextbookReadRequestSchema.parse(input),signal));}
  async figure(input:z.infer<typeof TextbookFigureRequestSchema>,signal?:AbortSignal){return TextbookFigureResultSchema.parse(await this.call("view_textbook_figure",TextbookFigureRequestSchema.parse(input),signal));}
}
