// Zero-model test for the b8 transport-diagnostic snapshot.
// Proves the snapshot accepts only the two exact WebSocket->HTTPS fallback literals and that
// every other guard (turn completion, finite usage, non-null output, real tool items, other
// error messages, turn.failed) still blocks classification as a completed transport.
import {pathToFileURL} from 'node:url';
const ROOT='E:/AgentData/Coach/knowledge/processing/audit/runtimes/';
const NEW=await import(pathToFileURL("E:/AgentWorkspaces/Coach/mortal-rag-ablation/coach/scripts/scene-study/textbook-audit.mjs"));
const OLD=await import(pathToFileURL(ROOT+'web-target-text-chain-20261027/textbook-audit.mjs'));
const NEW_CLI=await import(pathToFileURL("E:/AgentWorkspaces/Coach/mortal-rag-ablation/coach/scripts/scene-study/textbook-production-cli.mjs"));
const OLD_CLI=await import(pathToFileURL(ROOT+'web-target-text-chain-20261027/textbook-production-cli.mjs'));

const OLD_MSG='Falling back from WebSockets to HTTPS transport. stream disconnected before completion: tls handshake eof';
const NEW_MSG='Falling back from WebSockets to HTTPS transport. workspace routing discovery timed out';
const diag=msg=>({type:'item.completed',item:{id:'item_0',type:'error',message:msg}});
const agent={type:'item.completed',item:{id:'item_1',type:'agent_message',text:'{}'}};
const turnDone=(usage={input_tokens:10,cached_input_tokens:0,output_tokens:5})=>({type:'turn.completed',usage});
const turnFailed={type:'turn.failed',error:{message:'boom'}};
const base=(events,extra={})=>({exitCode:0,timedOut:false,outputOverflow:false,output:{},events,...extra});
const cases=[
  ['old_diagnostic_completed',base([diag(OLD_MSG),agent,turnDone()]),true],
  ['new_diagnostic_completed',base([diag(NEW_MSG),agent,turnDone()]),true],
  ['both_diagnostics_completed',base([diag(NEW_MSG),diag(OLD_MSG),agent,turnDone()]),true],
  ['real_tool_item',base([diag(NEW_MSG),{type:'item.completed',item:{id:'item_2',type:'mcp_tool_call',tool:'shell'}},agent,turnDone()]),false],
  ['unrecognized_error_message',base([diag('Falling back from WebSockets to HTTPS transport. something else'),agent,turnDone()]),false],
  ['error_item_with_extra_keys',base([{type:'item.completed',item:{id:'item_0',type:'error',message:NEW_MSG,code:'x'}},agent,turnDone()]),false],
  ['turn_failed',base([diag(NEW_MSG),agent,turnFailed]),false],
  ['null_output',base([diag(NEW_MSG),agent,turnDone()],{output:null}),false],
  ['no_usage',base([diag(NEW_MSG),agent,{type:'turn.completed'}]),false],
  ['nonzero_exit',base([diag(NEW_MSG),agent,turnDone()],{exitCode:1}),false],
  ['timed_out',base([diag(NEW_MSG),agent,turnDone()],{timedOut:true}),false]
];
const failures=[];
const rows=cases.map(([name,result,expected])=>{
  const got=NEW.auditTransportCompleted(result);
  if(got!==expected)failures.push(`${name}: expected ${expected} got ${got}`);
  return {name,expected,got};
});
const oldNewMsg=OLD_CLI.isTextbookTransportDiagnosticItem(diag(NEW_MSG));
const oldOldMsg=OLD_CLI.isTextbookTransportDiagnosticItem(diag(OLD_MSG));
const newNewMsg=NEW_CLI.isTextbookTransportDiagnosticItem(diag(NEW_MSG));
if(oldNewMsg!==false)failures.push('old_runtime_must_reject_new_message');
if(oldOldMsg!==true)failures.push('old_runtime_must_accept_old_message');
if(newNewMsg!==true)failures.push('new_runtime_must_accept_new_message');
if(NEW.auditTransportCompleted(base([diag(NEW_MSG),agent,turnDone()]))&&OLD.auditTransportCompleted(base([diag(NEW_MSG),agent,turnDone()])))failures.push('snapshots_must_differ_on_new_message');
console.log(JSON.stringify({schema:'coac249-b8-transport-diag-test/1',cases:rows,
  oldRuntime:{acceptsNewMessage:oldNewMsg,acceptsOldMessage:oldOldMsg},
  newRuntime:{acceptsNewMessage:newNewMsg},
  modelCalls:0,passed:failures.length===0,failures},null,2));
process.exit(failures.length?1:0);
