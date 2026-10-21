import { api, $, esc, message, jobView } from '/client.mjs';
let state, pending = false, requestedBank;
function render() {
 const busy = pending || ['running','stopping'].includes(state.job?.status);
 const previous = requestedBank || $('#saved-bank').value;
 $('#saved-bank').innerHTML = state.generatedBanks.map(b => `<option value="${b.bankId}">${esc(b.name)} · ${b.availableCaseCount}/${b.options.count} 题 · ${b.ready?'已完成':'未完成'} · ${b.bankId.slice(0,8)}</option>`).join('') || '<option value="">尚无生成批次</option>';
 if(state.generatedBanks.some(b=>b.bankId===previous)){ $('#saved-bank').value=previous; requestedBank=undefined; }
 const bank = state.generatedBanks.find(b=>b.bankId===$('#saved-bank').value);
 $('#bank-summary').textContent = bank ? `种子 ${bank.options.seed} · 时限 ${bank.options.timeLimitSeconds} 秒 · 已生成 ${bank.availableCaseCount}/${bank.options.count} 题${bank.ready?' · 开发资料，未作为独立测试集':' · 可继续尚未发布的批次'}` : '先生成一批题目，完成后即可预览并交给 Coach 评测。';
 $('#use-bank').hidden = !bank?.ready || !bank.availableCaseCount;
 $('#use-bank').href = bank ? '/?bank=generated&id='+bank.bankId : '/';
 $('#resume-generation').hidden = !bank || bank.ready;
 $('#resume-generation').disabled = busy;
 $('#generate').disabled = busy;
 $('#stop').disabled = pending || state.job?.status !== 'running';
 $('#job-content').innerHTML = state.job ? jobView(state.job) : '<div class="empty-state"><strong>准备生成题库</strong><p>生成进度显示在这里，完成后可在已保存批次中选择与预览。</p></div>';
}
async function refresh(){try {state=await api('/api/state');render();$('#sync-status').textContent='已同步 '+new Date().toLocaleTimeString('zh-CN');}catch(e){message(e.message,true);}}
async function generate(resume=false){
 if(!resume&&!$('#generation-form').reportValidity())return;
 pending=true;render();
 try {
  const request=resume?{bankId:$('#saved-bank').value}:{generation:{preset:$('#generation-preset').value,count:Number($('#generation-count').value),seed:Number($('#generation-seed').value),timeLimitSeconds:Number($('#generation-time').value)}};
  const job=await api('/api/start',{mode:'generate',...request});requestedBank=job.bankId;
  message('已开始生成。刷新页面不会重复启动；预算耗尽会保留部分题目。');await refresh();
 }catch(e){message(e.message,true);}finally{pending=false;render();}
}
$('#generation-form').addEventListener('submit',e=>{e.preventDefault();void generate();});
$('#resume-generation').addEventListener('click',()=>generate(true));
$('#saved-bank').addEventListener('change',()=>{requestedBank=undefined;render();});
$('#refresh-banks').addEventListener('click',refresh);
$('#stop').addEventListener('click',async()=>{pending=true;render();try{await api('/api/stop',{});await refresh();}catch(e){message(e.message,true);}finally{pending=false;render();}});
await refresh();setInterval(refresh,3000);
