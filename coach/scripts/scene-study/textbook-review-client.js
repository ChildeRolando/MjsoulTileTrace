(() => {
 'use strict';
 const library=JSON.parse(document.getElementById('library-data').textContent),byId=id=>document.getElementById(id);
 const storageKey='coach-textbook-chapter-review:'+library.sourceCommit;
 let chapter,reviews={},storageAvailable=true;
 try{reviews=JSON.parse(localStorage.getItem(storageKey)||'{}');}catch{storageAvailable=false;}
 if(!reviews||typeof reviews!=='object'||Array.isArray(reviews))reviews={};
 function save(){
  reviews[chapter.id]={status:byId('review-choice').value,comment:byId('review-comment').value,sourceSha256:library.sources.find(s=>s.id===chapter.sourceId).sha256,bodySha256:library.bodySha256,updatedAt:new Date().toISOString()};
  try{localStorage.setItem(storageKey,JSON.stringify(reviews));storageAvailable=true;}catch{storageAvailable=false;}
  byId('save-status').textContent=storageAvailable?'意见已保存在本机浏览器；审核后可导出。':'浏览器无法保存意见；离开前请导出。';
 }
 function render(){
  let id;try{id=decodeURIComponent(location.hash.slice(1));}catch{id='';}
  const target=byId(id);
  chapter=library.chapters.find(c=>c.id===id||target?.closest('[data-article]')?.dataset.article===c.id)||library.chapters[0];
  for(const a of document.querySelectorAll('[data-chapter]')){if(a.dataset.chapter===chapter.id)a.setAttribute('aria-current','page');else a.removeAttribute('aria-current');}
  for(const a of document.querySelectorAll('[data-article]'))a.hidden=a.dataset.article!==chapter.id;
  byId('review-panel').hidden=false;byId('review-focus').textContent=chapter.reviewFocus;
  const r=reviews[chapter.id];
  byId('review-choice').value=r?.bodySha256===library.bodySha256&&['pending','accept','revise','reject'].includes(r.status)?r.status:'pending';
  byId('review-comment').value=typeof r?.comment==='string'?r.comment:'';
  byId('save-status').textContent=!storageAvailable?'浏览器无法保存意见；请使用导出。':r&&r.bodySha256!==library.bodySha256?'正文已更新，原备注保留，请重新确认审核结论。':'审核意见仅保存在本机；可以导出交回。';
  if(target)requestAnimationFrame(()=>target.scrollIntoView({block:'start'}));
 }
 byId('review-choice').addEventListener('change',save);byId('review-comment').addEventListener('input',save);
 byId('export-review').addEventListener('click',()=>{
  save();const payload={schema:'coach-textbook-review/1',bodySha256:library.bodySha256,exportedAt:new Date().toISOString(),chapters:library.chapters.map(c=>{const r=reviews[c.id];return {chapterId:c.id,comment:typeof r?.comment==='string'?r.comment:'',status:r?.bodySha256===library.bodySha256?r.status:'pending',bodySha256:library.bodySha256,sourceSha256:library.sources.find(s=>s.id===c.sourceId).sha256,updatedAt:r?.updatedAt??null};})};
  const url=URL.createObjectURL(new Blob([JSON.stringify(payload,null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download='教材审核意见.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
 });
 window.addEventListener('hashchange',render);render();
})();
