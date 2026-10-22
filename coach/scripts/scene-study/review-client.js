(() => {
  const cases=[...document.querySelectorAll('article[data-id],article[data-label]')];
  const picker=document.querySelector('#case-picker'),previous=document.querySelector('#previous-case'),next=document.querySelector('#next-case');
  const status=document.querySelector('#save-status'),progress=document.querySelector('#case-progress');
  const fields=[document.querySelector('#reviewer'),...cases.flatMap(c=>[...c.querySelectorAll('input,select,textarea')])].filter(Boolean);
  const pickers=[],automatic=window.automaticDraft;
  let index=0;
  cases.forEach((c,i)=>{const o=document.createElement('option');o.value=String(i);o.textContent=c.querySelector('h2').textContent;picker.append(o);
    const draft=automatic?.cases.find(x=>x.caseId===c.dataset.id);
    for(const row of c.querySelectorAll('[data-topic]')){
      const topic=row.querySelector('td').textContent,gap=row.querySelector('[type=checkbox]');gap.className='knowledge-gap';gap.setAttribute('aria-label',topic+'知识缺口');row.querySelector('select').setAttribute('aria-label',topic+'需求');
      const mark=draft?.topics.find(t=>t.topic===row.dataset.topic);
      if(mark?.need){row.querySelector('select').value=mark.need;row.querySelector('input:not([type=checkbox])').value=mark.chapters.join(',');gap.checked=mark.gap;const reason=document.createElement('small');reason.className='annotation-reason';reason.textContent=`自动建议 · ${ {high:'较高',medium:'中等',low:'较低'}[mark.confidence]}把握：${mark.reason}`;row.querySelector('td').append(reason);}
      pickers.push(window.createChapterPicker(row,window.reviewCards));
    }
    if(draft?.notes)c.querySelector('textarea').value=draft.notes;
    c.querySelector('textarea').setAttribute('aria-label','评审说明');
    for(const side of c.querySelectorAll('[data-side]')) {
      const name=side.dataset.side==='left'?'左侧':'右侧';
      [...side.querySelectorAll('select:not(.severe)')].forEach((field,i)=>field.setAttribute('aria-label',name+['事实正确','关键问题覆盖','教材适用与引用支持','候选取舍','清晰与不确定性'][i]));
      side.querySelector('.severe').setAttribute('aria-label',name+'严重错误');
    }
    for(const field of c.querySelectorAll('[data-covered]'))field.setAttribute('aria-label',(field.dataset.covered==='left'?'左侧':'右侧')+'已覆盖主题');
    c.querySelector('.winner')?.setAttribute('aria-label','对照胜负');
  });
  function updateProgress(){const count=cases.filter(c=>[...c.querySelectorAll('select')].every(x=>x.value!=='')).length;progress.textContent=`${automatic?'已预填或修改':'已填写'} ${count} / ${cases.length} 局 · 切换局面保留标注`;}
  function show(value,scroll=false){index=Math.max(0,Math.min(cases.length-1,value));cases.forEach((c,i)=>{c.hidden=i!==index;});picker.value=String(index);previous.disabled=index===0;next.disabled=index===cases.length-1;updateProgress();if(scroll)cases[index].scrollIntoView({block:'start'});}
  function save(){try{localStorage.setItem(window.reviewStorageKey,JSON.stringify({index,draftHash:automatic?.hash,fields:fields.map(f=>f.type==='checkbox'?f.checked:f.value)}));status.textContent='标注已保存到当前浏览器 · 完成后请导出 JSON';}catch{status.textContent='浏览器无法保存草稿，请及时导出 JSON';}}
  try{const stored=JSON.parse(localStorage.getItem(window.reviewStorageKey)||'null');if(stored&&stored.fields.length===fields.length){fields.forEach((f,i)=>{const v=stored.fields[i];if(automatic&&stored.draftHash!==automatic.hash&&(v===''||v===false))return;if(f.type==='checkbox')f.checked=v;else f.value=v;});index=stored.index;status.textContent='已恢复此浏览器中保存的标注';}}catch{status.textContent='未能读取草稿；请保留已导出的标注文件';}
  pickers.forEach(p=>p.refresh());
  if(automatic&&typeof base!=='undefined')base.annotationSource=automatic.annotationSource;
  previous.onclick=()=>{show(index-1,true);save();};next.onclick=()=>{show(index+1,true);save();};picker.onchange=()=>{show(Number(picker.value),true);save();};
  for(const f of fields)f.addEventListener('input',()=>{save();updateProgress();});
  show(index);
})();
