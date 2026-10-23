import {readFile,writeFile,mkdir,access} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {join,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function validateLibrary(library){
 if(library.schema!=='coach-textbook-index/1'||library.policy.cardRole!=='index-only'||library.policy.modelExperiments!==false)throw Error('textbook_index_policy');
 const sources=new Map(library.sources.map(s=>[s.id,s])),ids=new Set(library.chapters.map(c=>c.id));
 if(sources.size!==library.sources.length||ids.size!==library.chapters.length)throw Error('textbook_duplicate_id');
 for(const s of sources.values())if(!/^[a-f0-9]{64}$/.test(s.sha256)||!/^[a-f0-9]{40}$/.test(s.gitBlob)||s.bytes<=0)throw Error('textbook_source_identity');
 for(const c of library.chapters){const s=sources.get(c.sourceId);
  if(!s||s.format!=='pdf'||!Number.isInteger(c.startPage)||!Number.isInteger(c.endPage)||c.startPage<1||c.endPage>s.pages||c.startPage>c.bodyStartPage||c.bodyStartPage>c.endPage)throw Error('textbook_chapter_boundary');
  if(['content','concept','conditions','exceptions'].some(k=>Object.hasOwn(c,k)))throw Error('textbook_index_contains_teaching_body');
  if(c.anchors.some(a=>!Number.isInteger(a.page)||a.page<c.startPage||a.page>c.endPage)||c.relatedChapterIds.some(id=>!ids.has(id)))throw Error('textbook_index_reference');
 }return library;
}
export function validateBodies(library,bodies){
 if(bodies.schema!=='coach-textbook-bodies/1'||bodies.language!=='zh-CN'||bodies.modelExperiments!==false||bodies.chapters.length!==library.chapters.length)throw Error('textbook_body_policy');
 const ids=new Set();
 for(const c of library.chapters){const a=bodies.chapters.filter(b=>b.chapterId===c.id);
  if(a.length!==1||a[0].sourceId!==c.sourceId||a[0].sourceSha256!==library.sources.find(s=>s.id===c.sourceId).sha256||!a[0].blocks.length)throw Error('textbook_body_source');
  for(const b of a[0].blocks){if(ids.has(b.id)||b.page<c.bodyStartPage||b.page>c.endPage)throw Error('textbook_block_anchor');ids.add(b.id);
   if(!['p','h2','list','figure'].includes(b.type))throw Error('textbook_block_type');
   if(b.type==='figure'&&!/^assets\/[a-z0-9-]+\.png$/.test(b.src))throw Error('textbook_figure_path');
   if(['p','h2'].includes(b.type)&&!b.text?.trim())throw Error('textbook_empty_body');
   if(b.type==='list'&&!b.items?.length)throw Error('textbook_empty_list');
  }
 }return bodies;
}
function blockHtml(b){
 const attrs=`id="${esc(b.id)}" data-source-page="${b.page}"`,source=`<a class="paragraph-source" href="#${esc(b.id)}" aria-label="定位本段，教材第 ${b.page} 页">p.${b.page}</a>`;
 if(b.type==='figure')return `<figure ${attrs}><a href="${esc(b.src)}" target="_blank" rel="noopener" aria-label="放大${esc(b.caption)}"><img src="${esc(b.src)}" loading="lazy" alt="${esc(b.caption)}${b.hand?'；手牌编码 '+esc(b.hand):'；图中摸牌、宝牌和副露标记来自原教材'}"></a><figcaption>${esc(b.caption)} · 点击牌图放大${source}</figcaption>${b.transcriptionText?`<details open><summary>完整牌例文字与牌编码</summary><p style="white-space:pre-line">${esc(b.transcriptionText)}</p></details>`:''}${b.tableText?`<details><summary>表格文字</summary><table><tbody>${b.tableText.map(r=>`<tr><th scope="row">${esc(r[0])}</th><td>${esc(r[1])}</td></tr>`).join('')}</tbody></table></details>`:''}</figure>`;
 if(b.type==='list')return `<div ${attrs}><ul>${b.items.map(x=>`<li>${esc(x)}</li>`).join('')}</ul>${source}</div>`;
 if(b.type==='h2')return `<h2 ${attrs}>${esc(b.text)}${source}</h2>`;
 return `<p ${attrs} ${b.emphasis?'class="source-emphasis"':''}>${esc(b.text)}${source}</p>`;
}
export async function buildTextbookReview(destination, suppliedLibrary){
 const library=validateLibrary(suppliedLibrary??JSON.parse(await readFile(new URL('./textbook-library.json',import.meta.url),'utf8')));
 const raw=await readFile(join(destination,'textbook-bodies.json'),'utf8'),bodies=validateBodies(library,JSON.parse(raw));
 const bodySha256=createHash('sha256').update(raw).digest('hex');
 for(const c of bodies.chapters)for(const b of c.blocks)if(b.type==='figure')await access(join(destination,b.src));
 const css=await readFile(new URL('./textbook-review.css',import.meta.url),'utf8'),script=await readFile(new URL('./textbook-review-client.js',import.meta.url),'utf8');
 const links=library.chapters.map(c=>`<a href="#${esc(c.id)}" data-chapter="${esc(c.id)}">${esc(c.title)}<small>${c.sourceId==='79-cn'?'79 博客 · 中文正文':'现代麻雀技术论 · 全文中译'}</small></a>`).join('');
 const articles=library.chapters.map(c=>{const b=bodies.chapters.find(b=>b.chapterId===c.id);return `<article id="${esc(c.id)}" data-article="${esc(c.id)}"><h1>${esc(c.title)}</h1><p class="quiet">${esc(library.sources.find(s=>s.id===c.sourceId).title)} · 第 ${c.bodyStartPage}–${c.endPage} 页</p><details class="edition-note"><summary>译文与整理说明</summary><p>${esc(b.translatorNote)}</p></details><div class="chapter-body">${b.blocks.map(blockHtml).join('')}</div><p class="related">继续阅读：${c.relatedChapterIds.map(id=>`<a href="#${id}">${esc(library.chapters.find(x=>x.id===id).title)}</a>`).join(' · ')||'其他章节见目录'}</p></article>`;}).join('');
 const data=JSON.stringify({...library,bodySha256}).replaceAll('<','\\u003c');
 const html=`<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>中文教材审阅 · Coach</title><style>${css}</style></head><body><header><strong>Coach · 中文教材审阅</strong><span>${library.chapters.length} 章完整正文 · 待审核</span></header><div class="reader-layout"><aside><nav aria-label="章节目录">${links}</nav><p class="quiet">直接阅读完整中文论证与原牌例。索引只负责定位，不替代教材正文。</p><button id="export-review" type="button">导出审核意见</button><p id="save-status" class="quiet" role="status"></p></aside><main><noscript><p>脚本未启用：下方仍可阅读全部章节，审核意见保存功能不可用。</p></noscript>${articles}<section class="review" id="review-panel" hidden><h2>审核这一章</h2><p id="review-focus"></p><label for="review-choice">结论</label><select id="review-choice"><option value="pending">尚未审核</option><option value="accept">可作为正文</option><option value="revise">需要修订</option><option value="reject">不采用本章</option></select><label for="review-comment">审核意见</label><textarea id="review-comment" rows="5" placeholder="可注明段落旁的页码、牌例和需要修改的译法。"></textarea></section><details><summary>知识库整理方式与来源</summary><p>本页仅使用你提供的本机教材。中文教材保留既有译文；日文教材逐段全译。新增批量内容须通过来源核对和自动校对；自动校对通过不等于人工认可教材结论。正文中的判断属于相应教材作者，不把不同教材的主张合成为一条规则。未运行模型实验。</p><p>当前知识库只保留这一份待审正文与索引，不提供旧摘要卡切换。已结束的实验档案不作为本库教材。</p><p><a href="./textbook-bodies.json">完整正文与出处数据</a> · <a href="./knowledge-index.json">章节索引</a></p></details></main></div><script id="library-data" type="application/json">${data}</script><script>${script}</script></body></html>`;
 await mkdir(destination,{recursive:true});await writeFile(join(destination,'knowledge.html'),html,'utf8');await writeFile(join(destination,'knowledge-index.json'),JSON.stringify(library,null,2)+'\n','utf8');
 return {entry:join(destination,'knowledge.html'),chapters:library.chapters.length,bodySha256,modelCalls:0};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){if(!process.argv[2])throw Error('Usage: node scripts/scene-study/textbook-review.mjs OUTPUT_DIRECTORY');console.log(JSON.stringify(await buildTextbookReview(resolve(process.argv[2]))));}