import { compactContent, paginate, roomyLayout } from '/compact-view.mjs';
import {api,$,compact,message,jobView,labels,esc,date} from '/client.mjs';
import {observationView,structured} from '/case-view.mjs';
import {experimentLabels,runMetrics} from '/presentation.mjs';
let state,pending=false,catalog;
const isMistakes=()=>$('#experiment-type').value==='mistakes';
const isGenerated=()=>$('#experiment-type').value==='generated';
function bank(){if(isGenerated())return state?.generatedBanks.find(b=>b.bankId===$('#generated-bank').value);return isMistakes()?{ready:true,availableCaseCount:state?.mistakeBank.availableCaseCount??0}:state?.catalogs[$('#experiment-type').value];}
function render(){
 const selected=$('#generated-bank').value||params.get('id');
 $('#generated-bank').innerHTML=state.generatedBanks.filter(b=>b.ready).map(b=>`<option value="${b.bankId}">${esc(b.name)} · ${b.availableCaseCount} 题 · ${b.bankId.slice(0,8)}</option>`).join('')||'<option value="">尚无已完成批次</option>';
 if(selected)$('#generated-bank').value=state.generatedBanks.some(b=>b.ready&&b.bankId===selected)?selected:'';
 $('#generated-bank-field').hidden=!isGenerated();
 $('#generated-bank').disabled=pending||['running','stopping'].includes(state.job?.status);
 $('#generation-summary').textContent=isGenerated()&&bank()?`种子 ${bank().options.seed} · 已生成 ${bank()?.availableCaseCount??0}/${bank().options.count} 题 · 仅用于开发评测`:'';
 const c=state.config,b=bank(),running=['running','stopping'].includes(state.job?.status);
 $('#recent-runs').innerHTML=state.runs.slice(0,3).map(run=>{const m=runMetrics(run.summary);return `<a class="recent-run" href="/results?run=${run.id}"><span>${date(run.manifest.startedAt)} · ${esc(run.manifest.rag.mode)}</span><strong>${esc(run.manifest.coach.model)} <span class="tag">${run.id.slice(0,8)}</span></strong><span>${m?`${m.succeeded}/${m.selected} 执行成功 · ${m.matched}/${m.succeeded} Mortal 匹配`:'归档未完成'}</span></a>`;}).join('')||'<p class="field-hint">尚无实验归档。完成首轮后将在此展示。</p>';
 $('#console-tokens').textContent=compact(state.budget.knownTotalTokens);
 $('#console-budget-note').textContent=`报警线 ${compact(state.budget.warningThreshold)} tokens${state.budget.unknownRunCount?` · ${state.budget.unknownRunCount} 份用量不完整`:''}`;
 $('#bank-count').textContent=`${b?.availableCaseCount??0} 道${isMistakes()?'错题':experimentLabels[$('#experiment-type').value]}`;
 $('#type-hint').textContent=isMistakes()?'按累计错题选择原局决策。每题使用当前配置重新作答，保留所有历史。':isGenerated()?'合法合成题库；预览只含决策时可见信息，Mortal 在评测时评分。':b?.description??'请先刷新题库。';
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
async function refresh(){try{const firstLoad=!state;state=await api('/api/state');if(firstLoad&&!params.has('bank')&&state.job?.experimentType==='generated'&&state.job.bankId){params.set('bank','generated');params.set('id',state.job.bankId);$('#experiment-type').value='generated';}render();$('#sync-status').textContent='已同步 '+new Date().toLocaleTimeString('zh-CN');}catch(e){message(e.message,true);}}
$('#start').addEventListener('click',async()=>{
 if(!$('#batch-size').reportValidity()||!$('#batch-start').reportValidity())return;
 pending=true;render();
 try{await api('/api/start',{mode:$('#experiment-mode').value,experimentType:$('#experiment-type').value,...(isGenerated()?{bankId:$('#generated-bank').value}:{}),maxCases:Number($('#batch-size').value),caseOffset:Number($('#batch-start').value)-1});message('实验已启动。完成后可在实验结果中查看，错题计数自动更新。');await refresh();}catch(e){message(e.message,true);}finally{pending=false;render();}
});
$('#stop').addEventListener('click',async()=>{pending=true;render();try{await api('/api/stop',{});await refresh();}catch(e){message(e.message,true);}finally{pending=false;render();}});
$('#experiment-type').addEventListener('change',()=>{$('#batch-start').value=1;$('#batch-size').value=Math.max(1,Math.min(10,bank()?.availableCaseCount??10));if(isMistakes()&&$('#experiment-mode').value==='fault')$('#experiment-mode').value='local';render();rememberSelection();});
$('#experiment-mode').addEventListener('change',()=>{$('#mode-hint').textContent=$('#experiment-mode').value==='compare'?'对同一批案例依次运行 Off / Local。':$('#experiment-mode').value==='fault'?'首次 helper 调用注入超时，保留实际失败记录。':'使用当前模型和预算进行一次实际运行。';});
$('#refresh-bank').addEventListener('click',async()=>{pending=true;render();try{if(!isMistakes()&&!isGenerated())await api('/api/start',{mode:'catalog'});await refresh();message(isMistakes()?'错题库已更新。':isGenerated()?'生成批次已更新。':'正在更新开发题库。');}catch(e){message(e.message,true);}finally{pending=false;render();}});
$('#browse-bank').addEventListener('click',async()=>{if(isMistakes()){location.href='/mistakes';return;}try{catalog=await api('/api/catalog?type='+$('#experiment-type').value+'&bank='+encodeURIComponent($('#generated-bank').value));$('#catalog-note').textContent=catalog.generated?`${catalog.cases.length} 道合法合成题 · 种子 ${catalog.generated.seed} · 不含 Mortal 答案。`:'只展示决策时可见的信息，不含 Mortal 答案。';$('#catalog-case').innerHTML=catalog.cases.map((c,i)=>`<option value="${i}">第 ${i+1} 题 · 原局决策 ${c.canonicalDecisionOrder+1}</option>`).join('');$('#catalog-panel').hidden=false;document.body.classList.add('catalog-view');showCase();window.scrollTo(0,0);}catch(e){message(e.message,true);}});
function showCase(){const row=catalog.cases[Number($('#catalog-case').value)];$('#catalog-preview').innerHTML=observationView(row.observation)+structured('preview','完整盲测输入',row.observation);compactContent($('#catalog-preview'),'catalog-'+row.canonicalDecisionOrder);}
$('#catalog-case').addEventListener('change',showCase);$('#close-catalog').addEventListener('click',()=>{$('#catalog-panel').hidden=true;document.body.classList.remove('catalog-view');$('#browse-bank').focus();});
function rememberSelection(){params.set('bank',$('#experiment-type').value);if(isGenerated())params.set('id',$('#generated-bank').value);else params.delete('id');history.replaceState(null,'','/?'+params);}
const params=new URLSearchParams(location.search);if(['flat','spatial','mistakes','generated'].includes(params.get('bank')))$('#experiment-type').value=params.get('bank');
$('#generated-bank').addEventListener('change',()=>{$('#batch-start').value=1;$('#batch-size').value=Math.max(1,Math.min(10,bank()?.availableCaseCount??10));render();rememberSelection();});
if(params.get('run'))location.replace('/results?'+params);
document.querySelector('.launch-help').open=roomyLayout();
document.querySelector('.activity-panel').insertBefore(document.querySelector('.console-recent'), document.querySelector('.activity-footer'));
await refresh();if(isMistakes()||isGenerated())$('#batch-size').value=Math.max(1,Math.min(10,bank()?.availableCaseCount??0));
setInterval(refresh,3000);
