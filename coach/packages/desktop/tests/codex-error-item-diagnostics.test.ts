import { describe, it, expect, vi } from 'vitest';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { ChildProcessWithoutNullStreams } from 'node:child_process';
import { errorItemDiagnostic } from '../src/llm-provider/codex-error-item-diagnostics.js';
import { ARENA_SELECTIVE_OUTPUT_SCHEMA } from '../src/blind-discard-arena-provider.js';

// The test seam never reads or writes an auth file and never starts a real process.
vi.mock('../src/llm-provider/codex-arena-isolation.js', () => ({
  prepareCodexArenaIsolation: async () => ({args: [], environment: {}, redact: (s: string) => s, dispose: async () => {}, disposeSync: () => {}, metadata: {adapter:'synthetic'}}),
  verifyArenaRuntimePin: async () => {},
}));
import { createCodexArenaToolCallProvider, type CodexCoachProcessPort } from '../src/llm-provider/codex-cli.js';

class FakeChild extends EventEmitter {
  stdin=new PassThrough(); stdout=new PassThrough(); stderr=new PassThrough(); input: Buffer[]=[]; killed=false; done=false;
  constructor(private readonly output: string) { super();this.stdin.on('data',(v:Buffer)=>this.input.push(Buffer.from(v)));this.stdin.once('end',()=>this.finish(0,this.output)); }
  kill() { this.killed=true;this.finish(1,'');return true; }
  finish(code:number, output:string) {if(this.done)return;this.done=true;this.stdout.end(output);this.stderr.end();setImmediate(()=>{this.emit('exit',code,null);this.emit('close',code,null);});}
}
const eventStream=(events:unknown[])=>events.map(x=>JSON.stringify(x)).join('\n')+'\n';
async function execute(events:unknown[], enabled:boolean) {
 const diagnostics:unknown[]=[], audits:unknown[]=[], calls:FakeChild[]=[];
 const port:CodexCoachProcessPort={findExecutable:()=> 'mock-only',spawn:((_,args)=>{const child=new FakeChild(args?.[0]==='exec'?eventStream(events):'codex-cli 0.162.1\n');calls.push(child);return child as unknown as ChildProcessWithoutNullStreams;}) as CodexCoachProcessPort['spawn'],makeTempDirectory:()=>mkdtemp(join(tmpdir(),'arena-error-item-mock-')),removeTempDirectory:async p=>{await rm(p,{recursive:true,force:true})},removeTempDirectorySync:()=>{}};
 const provider=createCodexArenaToolCallProvider({modelName:'gpt-6.1-terra',reasoningEffort:'high',processPort:port,isolation:{loopbackProbe:{baseUrl:'http://127.0.0.1:1/v1'},captureErrorItemDiagnostics:enabled,onDiagnostic:x=>diagnostics.push(x)}});
 const input={messages:[{role:'system' as const,content:'same system'},{role:'user' as const,content:'same public input'}],tools:[],outputSchema:ARENA_SELECTIVE_OUTPUT_SCHEMA,requireIsolatedContext:true,inputProfile:'selective-research-v1' as const,maxInputBytes:131072,maxOutputBytes:16384,maxOutputTokens:32768};
 const result=await provider.request(input,new AbortController().signal,x=>audits.push(x));
 return {result,diagnostics,audits,execInputs:calls.slice(1).map(x=>Buffer.concat(x.input).toString('utf8')),execCount:calls.length-1,killed:calls.slice(1).map(x=>x.killed)};
}
const prefix=[{type:'thread.started'},{type:'turn.started'}];
describe('opt-in safe error-item metadata',()=>{
 it('is absent by default and ignores other item types',()=>{expect(errorItemDiagnostic({type:'error',code:'timeout'},false)).toBeUndefined();for(const type of ['reasoning','agent_message','command_execution','mcp_tool_call'])expect(errorItemDiagnostic({type,text:'CANARY_PRIVATE'},true)).toBeUndefined()});
 it('retains only allowlisted values, field types and explicitly unverified text hints',()=>{const x=errorItemDiagnostic({type:'error',code:'rate_limit_exceeded',http_status:429,status:0,message:'too many requests CANARY_SECRET sk-abc123456789000 PRIVATE_PATH C:\\Users\\name',text:'timeout and network CANARY_REASONING',unknown:{credential:'DO_NOT_SAVE'},error:{code:'untrusted dynamic secret',status:503,message:'authentication'}},true)!;expect(x).toMatchObject({directCode:'rate_limit_exceeded',nestedCode:'unknown',httpStatus:429,statusHttpCode:'unknown',nestedStatusHttpCode:503,hints:['authentication','connection','resource_limit','timeout'],hintsAreVerifiedCause:false});expect(JSON.stringify(x)).not.toMatch(/CANARY|sk-|PRIVATE_PATH|Users|DO_NOT_SAVE|untrusted/)});
 it('distinguishes missing, null, wrong types and invalid HTTP status from zero',()=>{const x=errorItemDiagnostic({type:'error',code:null,http_status:0,status:'429',message:7,error:[]},true)!;expect(x.fields).toMatchObject({code:'null',httpStatus:'number',status:'string',message:'number',text:'missing',error:'array',nestedCode:'missing'});expect(x).toMatchObject({directCode:'unknown',httpStatus:'unknown',statusHttpCode:'unknown',hints:[]})});
 it('does not preserve arbitrary text, path, secret or hash of raw item',()=>{const x=errorItemDiagnostic({type:'error',code:'SECRET_CODE',http_status:999,text:'SECRET_STRING /tmp/private sk-fake123456789012',payload:{reasoning:'PRIVATE_REASONING'}},true)!;expect(JSON.stringify(x)).not.toMatch(/SECRET|private|sk-fake|reasoning|999/);expect(x.directCode).toBe('unknown');expect(x.httpStatus).toBe('unknown')});
 it.each(['item.started','item.updated','item.completed'])('captures an error on %s without changing failure handling',async phase=>{const events=[...prefix,{type:phase,item:{type:'error',error:{code:'timeout',message:'timed out SECRET_CANARY'}}}],a=await execute(events,false),b=await execute(events,true);expect(b.result).toEqual(a.result);expect(b.execCount).toBe(1);expect(b.execInputs).toEqual(a.execInputs);expect(b.diagnostics[0]).toMatchObject({unexpectedItemPhase:phase,errorItemDiagnostic:{nestedCode:'timeout',hints:['timeout'],hintsAreVerifiedCause:false}});expect(JSON.stringify(b.diagnostics)).not.toContain('SECRET_CANARY')});
 it('has identical failure, kill, no-retry, request bytes and audit with opt-in off/on',async()=>{const events=[...prefix,{type:'item.completed',item:{type:'error',code:'rate_limit_exceeded',http_status:429,message:'too many requests CANARY_SECRET',reasoning:'PRIVATE_REASONING'}}];const a=await execute(events,false),b=await execute(events,true);expect(b.result).toEqual(a.result);expect(b.result).toMatchObject({status:'provider_error',failureCode:'cli_unexpected_item'});expect(b.result).not.toHaveProperty('usage');expect(b.execInputs).toEqual(a.execInputs);expect(b.audits).toEqual(a.audits);expect(b.execCount).toBe(1);expect(b.killed).toEqual(a.killed);expect(a.diagnostics[0]).not.toHaveProperty('errorItemDiagnostic');expect(b.diagnostics[0]).toMatchObject({unexpectedItemKind:'error',errorItemDiagnostic:{directCode:'rate_limit_exceeded',httpStatus:429,hints:['resource_limit'],hintsAreVerifiedCause:false}});expect(JSON.stringify(b.diagnostics)).not.toMatch(/CANARY_SECRET|PRIVATE_REASONING/)});
 it('preserves success, reported usage, payload and audit; emits nothing for reasoning or tools',async()=>{const events=[...prefix,{type:'item.completed',item:{type:'reasoning',text:'PRIVATE_REASONING'}},{type:'item.completed',item:{type:'agent_message',text:JSON.stringify({response:{kind:'final',answer:{tile:'1m',red:false}}})}},{type:'turn.completed',usage:{input_tokens:10,cached_input_tokens:2,output_tokens:3}}];const a=await execute(events,false),b=await execute(events,true);expect(b.result).toEqual(a.result);expect(b.result).toMatchObject({status:'final',usage:{inputTokens:10,cachedInputTokens:2,outputTokens:3,totalTokens:13}});expect(b.execInputs).toEqual(a.execInputs);expect(b.audits).toEqual(a.audits);expect(b.diagnostics[0]).not.toHaveProperty('errorItemDiagnostic');expect(JSON.stringify(b.diagnostics)).not.toContain('PRIVATE_REASONING');const tool=await execute([...prefix,{type:'item.completed',item:{type:'command_execution',text:'PRIVATE_COMMAND'}}],true);expect(tool.result).toMatchObject({status:'provider_error',failureCode:'cli_unexpected_item'});expect(tool.diagnostics[0]).not.toHaveProperty('errorItemDiagnostic');expect(JSON.stringify(tool.diagnostics)).not.toContain('PRIVATE_COMMAND')});
});
