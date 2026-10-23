// Presentation only: reuse Arena's board; no treatment or scoring changes.
import { readFile,writeFile,mkdir,copyFile,readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { observationView,tileImages } from '../../arena-console/case-view.mjs';
import { hash } from './common.mjs';
import { writeKnowledgeReader } from './knowledge-reader.mjs';
const embed=value=>JSON.stringify(value).replaceAll('<','\\u003c');
export function graphicalScene(observation) {
  return observationView(observation).replaceAll('src="/tiles/','loading="lazy" src="./assets/tiles/');
}
function actionGraphic(encoded) {
  const [, [id,red], mode] = JSON.parse(decodeURIComponent(encoded));
  return tileImages([{id,red}],mode==='tsumogiri'?'摸切':'手切').replaceAll('src="/tiles/','loading="lazy" src="./assets/tiles/');
}
export async function polishReviewPresentation(out) {
  const dataset=JSON.parse(await readFile(join(out,'dataset.json'),'utf8')),review=join(out,'review');
  const knowledge=JSON.parse(await readFile(join(out,'knowledge.json'),'utf8'));
  await writeKnowledgeReader(review,knowledge);
  let feedback=null;try{feedback=JSON.parse(await readFile(join(out,'review-feedback.json'),'utf8'));}catch(e){if(e.code!=='ENOENT')throw e;}
  if(feedback&&(feedback.datasetHash!==hash(dataset)||feedback.knowledgeHash!==hash(knowledge)))throw new Error('study_review_feedback_binding');
  let automatic=null;try{automatic=JSON.parse(await readFile(join(out,'automatic-draft.json'),'utf8'));}catch(e){if(e.code!=='ENOENT')throw e;}
  if(automatic&&(automatic.datasetHash!==hash(dataset)||automatic.knowledgeHash!==hash(knowledge)))throw new Error('study_automatic_draft_binding');
  const css=(await Promise.all(['../../arena-console/style.css','../../arena-console/layout.css','./review.css'].map(p=>readFile(new URL(p,import.meta.url),'utf8')))).join('\n');
  const client=(await Promise.all(['./chapter-picker.js','./review-client.js'].map(p=>readFile(new URL(p,import.meta.url),'utf8')))).join('\n');
  const assets=join(review,'assets/tiles');await mkdir(assets,{recursive:true});
  const source=new URL('../../packages/desktop/src/renderer/tiles/',import.meta.url);
  for(const name of (await readdir(source)).filter(n=>n.endsWith('.svg')))await copyFile(new URL(name,source),join(assets,name));
  for(const name of ['knowledge-needs-60','blind-48']) {
    const path=join(review,name+'.html');let html=await readFile(path,'utf8');
    const cases=name==='knowledge-needs-60'?dataset.cases.filter(c=>c.split==='evaluation'):dataset.blindIds.map(id=>dataset.cases.find(c=>c.id===id));
    let ordinal=0;
    html=html.replace(/(<article data-(?:id|label)="[^"]+"><h2>)[\s\S]*?<table><tr><th>弃牌候选/g,(_,prefix)=>{
      const c=cases[ordinal++];return `${prefix}${name==='knowledge-needs-60'?'局面 '+ordinal:'Q'+String(ordinal).padStart(2,'0')}</h2>${graphicalScene(c.observation)}<table class="candidate-facts"><tr><th>弃牌候选`;
    });
    if(ordinal!==cases.length)throw new Error('study_review_scene_count_mismatch');
    html=html.replace(/<table class="candidate-facts">[\s\S]*?<\/table>/g,table=>`<details class="candidate-detail"><summary>候选比较：向听、进张、等待与逐家现物</summary><div class="table-scroll">${table.replace(/<td>action:v1:([^<]+)<\/td>/g,(_,encoded)=>`<td>${actionGraphic(encoded)}</td>`)}</div></details>`)
      .replace(/<style>[\s\S]*?<\/style>/,`<meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}</style>`)
      .replace('<header>','<body class="study-review"><header>')
      .replace('</header>','<span id="save-status" role="status">标注自动保存在当前浏览器</span></header><nav class="study-navigation" aria-label="局面切换"><button type="button" class="quiet-button" id="previous-case">上一局</button><label>局面 <select id="case-picker" aria-label="选择局面"></select></label><button type="button" class="quiet-button" id="next-case">下一局</button><span id="case-progress" role="status"></span></nav>')
      .replace('E/S/W/N 为东南西北，P/F/C 为白发中','1z–7z 依次表示东南西北白发中')
      .replaceAll("document.querySelectorAll('article')","document.querySelectorAll('article[data-id],article[data-label]')")
      .replaceAll("r.querySelector('[type=checkbox]')","r.querySelector('.knowledge-gap')")
      .replace("window.addEventListener('beforeunload',e=>{if(document.querySelector('input,select,textarea')){e.preventDefault();e.returnValue='';}});",'')
      .replace('<script>',`<script>window.reviewStorageKey=${embed('coach-scene-review:'+name+':'+dataset.createdAt)};window.reviewCards=${embed(knowledge.cards.map(c=>({id:c.id,title:c.title,system:c.source.system,chapter:c.source.chapter})))};window.automaticDraft=${embed(name==='knowledge-needs-60'&&automatic?{...automatic,hash:hash(automatic)}:null)};</script><script>`)
      .replace('</html>',`<script>${client}</script></body></html>`);
    if(name==='knowledge-needs-60')html=html.replace(/<p>请在阅读模式结果[\s\S]*?<\/p>/, '<p class="review-intro">先看完整牌局，再标注知识主题与可接受章节。缺口标记只表示当前卡片待核对，不能据此断定教材未覆盖；请先查看原文。请在阅读模型讲解之前完成。</p>');
    else {
      const goldPage=await readFile(join(review,'knowledge-needs-60.html'),'utf8');
      const library=goldPage.match(/<details><summary>知识卡目录[\s\S]*?<\/details>/)?.[0];
      if(library)html=html.replace('<article data-label=',library+'<article data-label=');
      html=html.replace('<p>不得查阅组别映射、模式清单或运行档案。姓名：<input id="reviewer"></p>','<p class="review-intro">对照完整牌局评审左右讲解；请勿查阅组别映射、模式清单或运行档案。</p><label class="reviewer-field">评审姓名<input id="reviewer" autocomplete="name"></label>');
    }
    html=html.replace(/<p>评审姓名：<input id="reviewer"><\/p>/,'<label class="reviewer-field">评审姓名<input id="reviewer" autocomplete="name"></label>');
    html=html.replaceAll('<button onclick="download()">','<button class="primary-button" onclick="download()">');
    html=html.replaceAll('可接受章节(如 b10,a01)','可接受章节（多选）');
    html=html.replace('<span id="save-status"', '<a class="knowledge-reader-link" href="./knowledge.html" target="_blank" rel="noopener">阅读教材与知识卡</a><span id="save-status"');
    html=html.replaceAll('<th>知识缺口</th>','<th>卡片缺口<br>（待核对）</th>');
    if(name==='knowledge-needs-60'&&feedback)html=html.replace('<nav class="study-navigation"','<p class="review-feedback"><strong>审核反馈：</strong>主要问题是知识卡适用条件过窄及模型误判，不能归为教材覆盖不足。原自动标记保留供追溯，逐项修订待完成。</p><nav class="study-navigation"');
    if(name==='knowledge-needs-60'&&automatic)html=html.replace('<nav class="study-navigation"',`<p class="automatic-notice"><strong>自动标注草稿 · gpt-6.1-sol / high</strong> · ${automatic.cases.filter(c=>c.topics.every(t=>t.need!==null)).length}/60 局已生成，尚未人工复核。逐项理由仅供检查，不能作为专家有效性结论。</p><nav class="study-navigation"`);
    if(feedback)html=html.replace('60/60 局已生成，尚未人工复核。','60/60 局已生成；已收到总体审核，逐项修订待完成。');
    await writeFile(path,html,'utf8');
  }
  return {component:'arena-console/case-view.mjs#observationView',cases:60,blind:48};
}
