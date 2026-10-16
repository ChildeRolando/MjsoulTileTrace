import { compactContent, paginate, roomyLayout } from '/compact-view.mjs';
import {api,$,compact,message,jobView,labels,esc,date} from '/client.mjs';
import {observationView,structured} from '/case-view.mjs';
import {experimentLabels,runMetrics} from '/presentation.mjs';
let state,pending=false,catalog;
const isMistakes=()=>$('#experiment-type').value==='mistakes';
function bank(){return isMistakes()?{ready:true,availableCaseCount:state?.mistakeBank.availableCaseCount??0}:state?.catalogs[$('#experiment-type').value];}
function render(){
 const c=state.config,b=bank(),running=['running','stopping'].includes(state.job?.status);
 $('#recent-runs').innerHTML=state.runs.slice(0,3).map(run=>{const m=runMetrics(run.summary);return `<a class="recent-run" href="/results?run=${run.id}"><span>${date(run.manifest.startedAt)} · ${esc(run.manifest.rag.mode)}</span><strong>${esc(run.manifest.coach.model)} <span class="tag">${run.id.slice(0,8)}</span></strong><span>${m?`${m.succeeded}/${m.selected} 执行成功 · ${m.matched}/${m.succeeded} Mortal 匹配`:'归档未完成'}</span></a>`;}).join('')||'<p class="field-hint">尚无实验归档。完成首轮后将在此展示。</p>';
 $('#console-tokens').textContent=compact(state.budget.knownTotalTokens);
 $('#console-budget-note').textContent=`报警线 ${compact(state.budget.warningThreshold)} tokens${state.budget.unknownRunCount?` · ${state.budget.unknownRunCount} 份用量不完整`:''}`;
 $('#bank-count').textContent=`${b?.availableCaseCount??0} 道${isMistakes()?'错题':experimentLabels[$('#experiment-type').value]}`;
 $('#type-hint').textContent=isMistakes()?'按累计错题选择原局决策。每题使用当前配置重新作答，保留所有历史。':b?.description??'请先刷新题库。';
 $('#batch-hint').textContent=isMistakes()?`共 ${b?.availableCaseCount??0} 道错题，按错误次数排序。起始题号与题量冻结后依次重跑。`:`${b?.availableCaseCount??0} 道开发案例。Off / Local 使用相同题目范围。`;
 for(const id of ['#batch-size','#batch-start'])$(id).max=Math.max(1,b?.availableCaseCount??128);
 $('#start').disabled=pending||running||!b?.ready||!b?.availableCaseCount;$('#stop').disabled=pending||state.job?.status!=='running';
 $('#experiment-type').disabled=running||pending;$('#refresh-bank').disabled=running||pending;$('#browse-bank').disabled=!b?.ready;
 $('#start span:last-child').textContent=pending?'正在提交…':running?'实验运行中':'启动实验';
 $('#provider-model').textContent=c.model;$('#provider-route').textContent=c.provider==='codex-cli'?`Codex 订阅 · ${c.reasoningEffort}`:'OpenAI-compatible API';
 $('#limit-time').textContent=c.maxRunMs/1000+'s';$('#limit-turns').textContent=c.maxProviderTurns;$('#limit-tools').textContent=c.maxToolCalls;
 $('#job-badge').textContent=labels[state.job?.status]??'空闲';$('#job-content').className='';$('#job-content').innerHTML=jobView(state.job);paginate($('#job-content'),[...$('#job-content').querySelectorAll('.job-step')],4,'console-job-'+state.job?.id,'个步骤');
 $('#experiment-mode').querySelector('[value=fault]').disabled=isMistakes();
 if(state.budget.warning)message('已达到 Token 报警线。请查看模型与 API 配置中的预算。',true);
}
async function refresh(){try{state=await api('/api/state');render();$('#sync-status').textContent='已同步 '+new Date().toLocaleTimeString('zh-CN');}catch(e){message(e.message,true);}}
$('#start').addEventListener('click',async()=>{
 if(!$('#batch-size').reportValidity()||!$('#batch-start').reportValidity())return;
 pending=true;render();
 try{await api('/api/start',{mode:$('#experiment-mode').value,experimentType:$('#experiment-type').value,maxCases:Number($('#batch-size').value),caseOffset:Number($('#batch-start').value)-1});message('实验已启动。完成后可在实验结果中查看，错题计数自动更新。');await refresh();}catch(e){message(e.message,true);}finally{pending=false;render();}
});
$('#stop').addEventListener('click',async()=>{pending=true;render();try{await api('/api/stop',{});await refresh();}catch(e){message(e.message,true);}finally{pending=false;render();}});
$('#experiment-type').addEventListener('change',()=>{$('#batch-start').value=1;$('#batch-size').value=Math.max(1,Math.min(10,bank()?.availableCaseCount??10));if(isMistakes()&&$('#experiment-mode').value==='fault')$('#experiment-mode').value='local';render();});
$('#experiment-mode').addEventListener('change',()=>{$('#mode-hint').textContent=$('#experiment-mode').value==='compare'?'对同一批案例依次运行 Off / Local。':$('#experiment-mode').value==='fault'?'首次 helper 调用注入超时，保留实际失败记录。':'使用当前模型和预算进行一次实际运行。';});
$('#refresh-bank').addEventListener('click',async()=>{pending=true;render();try{if(!isMistakes())await api('/api/start',{mode:'catalog'});await refresh();message(isMistakes()?'错题库已更新。':'正在更新开发题库。');}catch(e){message(e.message,true);}finally{pending=false;render();}});
$('#browse-bank').addEventListener('click',async()=>{if(isMistakes()){location.href='/mistakes';return;}try{catalog=await api('/api/catalog?type='+$('#experiment-type').value);$('#catalog-case').innerHTML=catalog.cases.map((c,i)=>`<option value="${i}">第 ${i+1} 题 · 原局决策 ${c.canonicalDecisionOrder+1}</option>`).join('');$('#catalog-panel').hidden=false;document.body.classList.add('catalog-view');showCase();window.scrollTo(0,0);}catch(e){message(e.message,true);}});
function showCase(){const row=catalog.cases[Number($('#catalog-case').value)];$('#catalog-preview').innerHTML=observationView(row.observation)+structured('preview','完整盲测输入',row.observation);compactContent($('#catalog-preview'),'catalog-'+row.canonicalDecisionOrder);}
$('#catalog-case').addEventListener('change',showCase);$('#close-catalog').addEventListener('click',()=>{$('#catalog-panel').hidden=true;document.body.classList.remove('catalog-view');$('#browse-bank').focus();});
const params=new URLSearchParams(location.search);if(params.get('bank')==='mistakes')$('#experiment-type').value='mistakes';
if(params.get('run'))location.replace('/results?'+params);
document.querySelector('.launch-help').open=roomyLayout();
document.querySelector('.activity-panel').insertBefore(document.querySelector('.console-recent'), document.querySelector('.activity-footer'));
await refresh();if(isMistakes())$('#batch-size').value=Math.max(1,Math.min(10,bank().availableCaseCount));
setInterval(refresh,3000);
