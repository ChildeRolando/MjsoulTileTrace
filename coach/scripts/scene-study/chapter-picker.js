// Native disclosure with a searchable, grouped multi-select chapter table.
window.createChapterPicker = (row,cards) => {
  const value=row.querySelector('input:not([type=checkbox])'),topic=row.querySelector('td').firstChild.textContent.trim();
  value.type='hidden';value.className='chapter-value';
  const details=document.createElement('details'),summary=document.createElement('summary'),panel=document.createElement('div');
  details.className='chapter-picker';panel.className='chapter-options';
  summary.setAttribute('aria-label',topic+'可接受章节多选');details.append(summary,panel);value.after(details);
  let built=false;
  const selected=()=>new Set(value.value.split(/[,，\s]+/).filter(Boolean));
  function refresh(){const ids=selected();summary.textContent=ids.size?cards.filter(c=>ids.has(c.id)).map(c=>c.title).join('、'):'选择可接受章节（可多选）';summary.title=summary.textContent;for(const box of panel.querySelectorAll('input[type=checkbox]'))box.checked=ids.has(box.value);}
  details.addEventListener('toggle',()=>{
    if(!details.open||built)return;built=true;
    const search=document.createElement('input');search.type='search';search.placeholder='搜索章节标题或编号';search.setAttribute('aria-label',topic+'章节搜索');panel.append(search);
    const table=document.createElement('table');table.innerHTML='<thead><tr><th>选择</th><th>章节</th></tr></thead>';
    for(const system of ['beginners-luck-original-web','nemata-original-web']) {
      const body=document.createElement('tbody'),heading=document.createElement('tr'),cell=document.createElement('th');cell.colSpan=2;cell.textContent=system==='beginners-luck-original-web'?'Beginner’s Luck · 基础网页版':'现代麻雀技术论 · 旧网页版';heading.append(cell);body.append(heading);
      for(const card of cards.filter(c=>c.system===system)) {
        const tr=document.createElement('tr'),checkCell=document.createElement('td'),titleCell=document.createElement('td'),box=document.createElement('input'),label=document.createElement('label'),code=document.createElement('small');
        box.type='checkbox';box.value=card.id;box.id=`chapter-${row.closest('article').dataset.id}-${row.dataset.topic}-${card.id}`;box.checked=selected().has(card.id);box.setAttribute('aria-label',topic+'章节 '+card.title);
        label.htmlFor=box.id;label.textContent=card.title;code.textContent=`${card.id} · ${card.chapter}`;label.append(code);checkCell.append(box);titleCell.append(label);tr.append(checkCell,titleCell);tr.dataset.search=(card.id+' '+card.title+' '+card.chapter).toLowerCase();body.append(tr);
        box.addEventListener('change',()=>{const ids=selected();box.checked?ids.add(card.id):ids.delete(card.id);value.value=cards.filter(c=>ids.has(c.id)).map(c=>c.id).join(',');refresh();value.dispatchEvent(new Event('input',{bubbles:true}));});
      }
      table.append(body);
    }
    panel.append(table);search.addEventListener('input',()=>{const q=search.value.trim().toLowerCase();for(const tr of table.querySelectorAll('[data-search]'))tr.hidden=!tr.dataset.search.includes(q);});
  });
  refresh();return {refresh};
};
