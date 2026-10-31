export const $ = s => document.querySelector(s);
export const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]);
export const number = n => new Intl.NumberFormat('en-US').format(n);
export const compact = n => n >= 1e6 ? (n/1e6).toFixed(2)+'M' : n>=1000 ? (n/1000).toFixed(1)+'K' : number(n);
export const rate = (n,d) => d ? (100*n/d).toFixed(1)+'%' : '—';
export const date = s => new Date(s).toLocaleString('zh-CN',{month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'});
export const labels = { running:'运行中',stopping:'正在停止',stopped:'已停止',completed:'执行完成',failed:'执行失败',timeout:'超时',provider_error:'模型调用失败',provider_unavailable:'模型不可用',cancelled:'已取消',budget_exhausted:'达到预算',tool_failure:'工具失败',invalid_submission:'提交无效',label_binding_failure:'标签绑定失败',off:'RAG Off',local:'Local RAG',fault:'受控故障',compare:'Off / Local 对照',catalog:'刷新题库','mortal-details':'补算 Mortal 评分' };
export async function api(path,data){const r=await fetch(path,data===undefined?{}:{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});const body=await r.json();if(!r.ok)throw new Error(body.error??'操作未完成');return body;}
export function message(text,error=false){const n=$('#message');if(n){n.textContent=text;n.hidden=!text;n.classList.toggle('error',error);}}
export function jobView(job){
 if(!job)return '<div class="empty-state"><strong>暂无运行</strong></div>';
 return `<h3>${job.experimentType==='mistakes'?'错题重跑 · ':''}${esc(labels[job.mode]??job.mode)} · ${esc(job.model)}</h3><p>${date(job.startedAt)} 开始 · ${esc(labels[job.status]??job.status)}</p><div class="job-steps">${job.steps.map((s,i)=>`<div class="job-step"><span>${s.questionId?'错题 '+s.questionId.slice(0,6):'步骤 '+(i+1)}</span><span>${esc(labels[s.mode]??s.mode)}</span><span class="tag">${esc(labels[s.status]??s.status)}</span>${s.runId?`<a class="text-button" href="/results?run=${s.runId}">查看结果 ↗</a>`:''}${s.error?`<p class="tool-warning">${esc(s.error)}</p>`:''}</div>`).join('')}</div>`;
}
