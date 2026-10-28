// Offline study transport only. Production provider selection is unchanged.
import {spawn,execFile} from 'node:child_process';
import {createServer} from 'node:http';
import {mkdtemp,mkdir,readFile,rm,stat} from 'node:fs/promises';
import {tmpdir,homedir} from 'node:os';
import {join,resolve,sep} from 'node:path';
import {randomUUID,createHash} from 'node:crypto';
import {promisify} from 'node:util';
import {arenaCodexTurnInstructions,ArenaProviderRequestSchema,ArenaToolCallProviderResultSchema} from '@riichi-coach/desktop/blind-discard-arena-provider';
const exec=promisify(execFile);
export const COMMAND_CODE_ID='67b25f76-26ac-4318-b10f-27438a518ad3';
export const DEEPSEEK_PREFIX='deepseek/deepseek-v4.1-flash';
export const CLAUDE_EXE=join(homedir(),'AppData/Roaming/npm/node_modules/@anthropic-ai/claude-code/bin/claude.exe');
export const PROXY_URL='http://127.0.0.1:15721';
const finite=x=>typeof x==='number'&&Number.isFinite(x)&&x>=0;
const verifiedRuntimeContent=new Map();
export async function verifyClaudeRuntime(runtime){
  const info=await stat(runtime.executable);
  if(info.size!==runtime.size)return false;
  if(!runtime.sha256)return info.mtimeMs===runtime.mtimeMs;
  const key=JSON.stringify([runtime.executable,info.size,info.mtimeMs,info.ctimeMs,runtime.sha256]);
  if(!verifiedRuntimeContent.has(key))verifiedRuntimeContent.set(key,readFile(runtime.executable).then(bytes=>createHash('sha256').update(bytes).digest('hex')===runtime.sha256));
  return verifiedRuntimeContent.get(key);
}
export function claudeUsage(raw){
  if(!raw||typeof raw!=='object')return undefined;
  const out={};
  if(finite(raw.cache_read_input_tokens))out.cachedInputTokens=raw.cache_read_input_tokens;
  if(finite(raw.output_tokens))out.outputTokens=raw.output_tokens;
  if([raw.input_tokens,raw.cache_read_input_tokens,raw.cache_creation_input_tokens].every(finite))out.inputTokens=raw.input_tokens+raw.cache_read_input_tokens+raw.cache_creation_input_tokens;
  if(finite(out.inputTokens)&&finite(out.outputTokens))out.totalTokens=out.inputTokens+out.outputTokens;
  return Object.keys(out).length?out:undefined;
}
export function parseClaudeResult(event,request){
  const usage=claudeUsage(event?.usage);
  const bad=code=>({status:'provider_error',failureCode:code,...(usage?{usage}:{})});
  if(event?.type!=='result'||event.subtype!=='success'||event.is_error===true||!(event.num_turns===1||event.num_turns===2&&event.structured_output))return bad('claude_incomplete_single_turn');
  try{
    const text=typeof event.result==='string'?event.result.trim():'',fenced=/^```(?:json)?\s*\n([\s\S]*?)\n```$/.exec(text);
    const parsed=event.structured_output??JSON.parse(fenced?fenced[1]:text),tool=request.tools.find(t=>t.function.name===parsed.call?.name);
    if(!tool||Object.keys(parsed).sort().join(',')!=='call,decisionSummary'||Object.keys(parsed.call).sort().join(',')!=='arguments,name'||typeof parsed.decisionSummary!=='string'||!parsed.decisionSummary.trim()||parsed.decisionSummary.length>600)throw Error();
    if(tool.function.strict?(typeof parsed.call.arguments!=='object'||parsed.call.arguments===null||Array.isArray(parsed.call.arguments)):typeof parsed.call.arguments!=='string')throw Error();
    const outputBytes=Math.max(Buffer.byteLength(JSON.stringify(parsed),'utf8'),Buffer.byteLength(text,'utf8'));if(outputBytes>request.maxOutputBytes)return {status:'output_too_large',...(usage?{usage}:{})};
    return ArenaToolCallProviderResultSchema.parse({status:'ready',call:{name:parsed.call.name,arguments:typeof parsed.call.arguments==='string'?parsed.call.arguments:JSON.stringify(parsed.call.arguments)},decisionSummary:parsed.decisionSummary,outputBytes,...(usage?{usage}:{})});
  }catch{return bad('claude_invalid_model_response');}
}
export function claudeOutputSchema(request){
  return {type:'object',additionalProperties:false,properties:{call:{anyOf:request.tools.map(t=>({type:'object',additionalProperties:false,properties:{name:{type:'string',enum:[t.function.name]},arguments:t.function.strict?t.function.parameters:{type:'string'}},required:['name','arguments']}))},decisionSummary:{type:'string',minLength:1,maxLength:600}},required:['call','decisionSummary']};
}
// Read only public text or the structured submission from the one actual model
// response. CLI formatting helpers never get another inference request.
export function collectClaudeResponse(request){
  let started=0,complete=false,stopReason=null,text='',usage={},oversized=false;
  const tools=new Map();
  return {
    event(e){
      if(e.type==='message_start'){started++;usage={...e.message?.usage};}
      if(e.type==='content_block_start'){
        const c=e.content_block;if(c?.type==='text')text+=c.text??'';
        if(c?.type==='tool_use')tools.set(e.index,{name:c.name,input:c.input,json:''});
      }
      if(e.type==='content_block_delta'){
        if(e.delta?.type==='text_delta')text+=e.delta.text??'';
        if(e.delta?.type==='input_json_delta'&&tools.has(e.index))tools.get(e.index).json+=e.delta.partial_json??'';
      }
      if(e.type==='message_delta'){usage={...usage,...e.usage};if(e.delta?.stop_reason)stopReason=e.delta.stop_reason;}
      if(e.type==='message_stop')complete=true;
      if(Buffer.byteLength(text)+[...tools.values()].reduce((n,t)=>n+Buffer.byteLength(t.json||JSON.stringify(t.input)),0)>request.maxOutputBytes)oversized=true;
    },
    finish(){
      const publicProof={firstResponseComplete:complete,firstResponseStopReason:stopReason,outputToolCalls:tools.size,nativeUsage:usage};
      const bad=code=>({result:{status:'provider_error',failureCode:code,...(claudeUsage(usage)?{usage:claudeUsage(usage)}:{})},proof:publicProof});
      if(oversized)return {result:{status:'output_too_large',...(claudeUsage(usage)?{usage:claudeUsage(usage)}:{})},proof:publicProof};
      if(started!==1||!complete||!['end_turn','tool_use'].includes(stopReason))return bad('claude_incomplete_first_response');
      if(tools.size>1||[...tools.values()].some(t=>t.name!=='StructuredOutput'))return bad('claude_multiple_submissions');
      let output=text;
      if(tools.size){const t=[...tools.values()][0];try{output=JSON.stringify(t.json?JSON.parse(t.json):t.input);}catch{return bad('claude_invalid_model_response');}}
      publicProof.visibleResultText=output;publicProof.acceptedResponseSource='first_model_response';
      return {result:parseClaudeResult({type:'result',subtype:'success',num_turns:1,result:output,usage},request),proof:publicProof};
    },
  };
}
export async function proxyTarget(fetchImpl=fetch){
  const response=await fetchImpl(PROXY_URL+'/status',{signal:AbortSignal.timeout(3000)});if(!response.ok)throw Error('claude_proxy_unavailable');
  const status=await response.json(),target=status.active_targets?.find(t=>t.app_type==='claude');
  return target?.provider_id??status.current_provider_id;
}
const LOG_QUERY="import sqlite3,json,pathlib,sys; p=pathlib.Path.home()/'.cc-switch/cc-switch.db'; c=sqlite3.connect(p.resolve().as_uri()+'?mode=ro',uri=True,timeout=1); c.row_factory=sqlite3.Row; print(json.dumps([dict(r) for r in c.execute(\"select provider_id,model,request_model,status_code from proxy_request_logs where app_type='claude' and session_id=? order by created_at\",(sys.argv[1],))])); c.close()";
async function sessionProof(sessionId){
  const {stdout}=await exec('python',['-B','-c',LOG_QUERY,sessionId],{timeout:4000,windowsHide:true,maxBuffer:65536});return JSON.parse(stdout);
}
export function createClaudeCeilingProvider({runtime,fetchImpl=fetch,spawnImpl=spawn,lookupSession=sessionProof,timeoutMs=300000}){
  let proof={};
  return {
    descriptor:()=>({providerId:'claude-code-command-code',model:DEEPSEEK_PREFIX,protocolVersion:'arena-function-call/v1'}),
    getAuditProof:()=>structuredClone(proof),
    async request(raw,signal){
      const checked=ArenaProviderRequestSchema.safeParse(raw);if(!checked.success)return {status:'provider_error'};
      const request=checked.data,prompt=arenaCodexTurnInstructions(request.maxOutputTokens)+'\n'+JSON.stringify({messages:request.messages,tools:request.tools});
      if(Buffer.byteLength(prompt,'utf8')>request.maxInputBytes)return {status:'input_too_large'};
      const schema=JSON.stringify(claudeOutputSchema(request));if(schema.length>24000)return {status:'input_too_large'};
      const sessionId=randomUUID();proof={sessionId,expectedProviderId:COMMAND_CODE_ID,requestedAlias:'opus',requestedEffort:'high',forwardedModelRequests:0,outputToolCalls:0};
      let work,server,child,timedOut=false,controller=new AbortController(),resultEvent,stdoutBytes=0,stdioError=false,singleResponse;
      const fail=code=>{const usage=claudeUsage(resultEvent?.usage);return {status:'provider_error',failureCode:code,...(usage?{usage}:{})};};
      const abort=()=>{timedOut=true;controller.abort();child?.kill();server?.closeAllConnections();};
      const deadline=setTimeout(abort,timeoutMs);
      signal.addEventListener('abort',abort,{once:true});
      try{
        if(signal.aborted)return {status:'cancelled'};
        if(await proxyTarget(fetchImpl)!==COMMAND_CODE_ID)return fail('claude_proxy_route_changed');
        if(!await verifyClaudeRuntime(runtime))return fail('claude_runtime_changed');
        const settings=JSON.parse(await readFile(join(homedir(),'.claude/settings.json'),'utf8')),configured=settings.env??{},auth={};
        for(const key of ['ANTHROPIC_AUTH_TOKEN','ANTHROPIC_API_KEY'])if(typeof configured[key]==='string')auth[key]=configured[key];
        if(!Object.keys(auth).length)return fail('claude_proxy_credentials_missing');
        work=await mkdtemp(join(tmpdir(),'coach-ceiling-claude-'));await mkdir(join(work,'config'));
        // This relay forwards at most one model POST. SDK retries, helpers, tools
        // and second agent turns cannot silently add model calls to the study.
        server=createServer(async(req,res)=>{
          try{
            if(req.method!=='POST'||!req.url?.split('?')[0].endsWith('/messages')){res.writeHead(404);res.end();return;}
            const chunks=[];let bytes=0;for await(const chunk of req){bytes+=chunk.length;if(bytes>262144)throw Error('relay_input_over_budget');chunks.push(chunk);}
            const body=JSON.parse(Buffer.concat(chunks).toString('utf8'));
            if(typeof body.model!=='string'||!body.model.startsWith('claude-opus-')||proof.forwardedModelRequests!==0||body.tools?.some(t=>t.name!=='StructuredOutput')){proof.deniedAdditionalRequests=(proof.deniedAdditionalRequests??0)+1;res.writeHead(409);res.end('{"error":{"type":"invalid_request_error","message":"single Arena turn only"}}');return;}
            if(await proxyTarget(fetchImpl)!==COMMAND_CODE_ID)throw Error('claude_proxy_route_changed');
            proof.forwardedModelRequests=1;proof.requestModel=body.model;proof.requestedApiEffort=body.output_config?.effort??null;proof.nativeToolNames=body.tools?.map(t=>t.name)??[];
            const headers={...req.headers};delete headers.host;delete headers['content-length'];delete headers['transfer-encoding'];delete headers.connection;
            const upstream=await fetchImpl(PROXY_URL+'/v1/messages',{method:'POST',headers,body:JSON.stringify(body),signal:controller.signal});
            proof.httpStatus=upstream.status;res.writeHead(upstream.status,{'content-type':upstream.headers.get('content-type')??'text/event-stream'});
            const decoder=new TextDecoder(),collector=collectClaudeResponse(request);let pending='';
            for await(const chunk of upstream.body){
              pending+=decoder.decode(chunk,{stream:true});let pos;
              while((pos=pending.indexOf('\n'))>=0){const line=pending.slice(0,pos);pending=pending.slice(pos+1);if(line.startsWith('data:'))try{const event=JSON.parse(line.slice(5));collector.event(event);if(event.type==='message_start'&&typeof event.message?.model==='string')proof.responseModel=event.message.model;}catch{}}
              if(pending.length>1048576)pending='';res.write(chunk);
            }
            res.end();singleResponse=collector.finish();Object.assign(proof,singleResponse.proof);proof.cliStoppedAfterFirstResponse=true;child?.kill();
          }catch{proof.relayFailure=true;if(!res.headersSent)res.writeHead(502);res.end();}
        });
        await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
        const base='http://127.0.0.1:'+server.address().port,env={...process.env,...auth,ANTHROPIC_BASE_URL:base,ANTHROPIC_DEFAULT_OPUS_MODEL:'claude-opus-5',CLAUDE_CONFIG_DIR:join(work,'config'),CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC:'1',DISABLE_AUTOUPDATER:'1',CLAUDE_CODE_MAX_OUTPUT_TOKENS:String(request.maxOutputTokens)};
        delete env.CLAUDECODE;delete env.ANTHROPIC_MODEL;delete env.CLAUDE_CODE_OAUTH_TOKEN;
        const args=['--print','--bare','--model','opus','--effort','high','--output-format','stream-json','--verbose','--max-turns','1','--json-schema',schema,'--tools','','--permission-mode','dontAsk','--strict-mcp-config','--mcp-config','{"mcpServers":{}}','--setting-sources','','--no-session-persistence','--session-id',sessionId,'--system-prompt','Execute only the supplied Arena protocol turn.'];
        child=spawnImpl(runtime.executable,args,{cwd:work,env,windowsHide:true,stdio:['pipe','pipe','pipe']});
        const observe=event=>{if(event.type==='result')resultEvent=event;};
        let pending='';const outputDecoder=new TextDecoder();child.stdout.on('data',chunk=>{stdoutBytes+=chunk.length;if(stdoutBytes>4194304){stdioError=true;child.kill();return;}pending+=outputDecoder.decode(chunk,{stream:true});let pos;while((pos=pending.indexOf('\n'))>=0){const line=pending.slice(0,pos).trim();pending=pending.slice(pos+1);if(line)try{observe(JSON.parse(line));}catch{stdioError=true;}}});
        // Never archive CLI stderr or reasoning payloads.
        child.stderr.on('data',()=>{});child.stdin.on('error',()=>{});child.stdin.end(prompt);
        const exitCode=await new Promise(resolve=>{child.once('error',()=>resolve(-1));child.once('close',code=>resolve(code));});
        if(timedOut)return {status:'timeout'};
        pending+=outputDecoder.decode();
        if(pending.trim())try{observe(JSON.parse(pending));}catch{stdioError=true;}
        if(resultEvent){proof.reportedNativeTurnCount=resultEvent.num_turns;proof.reportedStructuredOutput=Boolean(resultEvent.structured_output);}
        if(!singleResponse||stdioError&&!proof.cliStoppedAfterFirstResponse)return fail('claude_cli_failed');
        let logs=[];try{logs=await lookupSession(sessionId);}catch{proof.sessionLogUnavailable=true;}
        proof.proxyRecords=logs;
        const models=logs.filter(r=>r.status_code>=200&&r.status_code<300).map(r=>r.model);
        const backend=models.at(-1)??proof.responseModel;proof.observedBackend=backend??null;
        if(proof.forwardedModelRequests!==1||!backend?.startsWith(DEEPSEEK_PREFIX)||logs.some(r=>r.provider_id!==COMMAND_CODE_ID)||await proxyTarget(fetchImpl)!==COMMAND_CODE_ID)return fail('claude_backend_not_verified');
        return singleResponse.result;
      }catch{return timedOut?{status:'timeout'}:fail('claude_transport_failed');}
      finally{
        clearTimeout(deadline);
        signal.removeEventListener('abort',abort);controller.abort();if(child&&child.exitCode===null)child.kill();
        if(server){server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
        if(work){const target=resolve(work),base=resolve(tmpdir())+sep;if(!target.startsWith(base)||!target.slice(base.length).startsWith('coach-ceiling-claude-'))throw Error('unexpected_claude_cleanup_path');await rm(target,{recursive:true,force:true,maxRetries:3,retryDelay:100});}
      }
    },
  };
}
