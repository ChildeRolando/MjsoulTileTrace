import { copyFile, mkdir, readFile } from 'node:fs/promises';
import { join, relative, resolve, isAbsolute, sep } from 'node:path';
import { tokenize } from '@riichi-coach/desktop/blind-discard-arena-rag';
import { matchScenePatterns } from '@riichi-coach/reasoning';
import { hash, read, writeOnce, DEFAULT_SNAPSHOT } from './ceiling-protocol.mjs';

const textFigure=f=>JSON.stringify({caption:f.caption??'',transcription:f.transcription??null,requiresImageForFullExample:f.requiresImageForFullExample??false});
export const textBlock=b=>b.type==='figure'?textFigure(b.figure):b.type==='list'?b.items.join('\n'):(b.tableCell?'[表格单元 '+JSON.stringify(b.tableCell)+']\n':'')+(b.tableCaptionFor?'[表格标题 '+b.tableCaptionFor+']\n':'')+(b.text??'')+(b.inlineFigures?.length?'\n'+b.inlineFigures.map(textFigure).join('\n'):'');
export function indexTextbook(corpus){
  // A passage is a complete teaching unit: conditions, exceptions, tables and
  // transcribed examples cannot be silently shortened to win a retrieval slot.
  const passages=corpus.units.map(u=>{
    const content=[u.chapterTitle,u.title,...u.blocks.map(textBlock)].filter(Boolean).join('\n');
    return {id:u.unitId,chapterId:u.chapterId,title:u.title,chapterTitle:u.chapterTitle??u.title,topics:u.topics??[],content,contentDigest:hash(content),source:u.source??{},contentRole:u.contentRole??'instruction',blockIds:u.blocks.map(b=>b.id),figureIds:u.blocks.flatMap(b=>b.type==='figure'?[b.figure.figureId]:(b.inlineFigures??[]).map(f=>f.figureId)),unviewedFigures:u.blocks.flatMap(b=>b.type==='figure'?[b.figure]:(b.inlineFigures??[])).filter(f=>f.requiresImageForFullExample).map(f=>f.figureId)};
  });
  return {version:'ceiling-whole-unit-index/v1',corpusId:corpus.corpusId,passages,chapters:[...new Map(passages.map(p=>[p.chapterId,{id:p.chapterId,title:p.chapterTitle}])).values()],counts:{units:passages.length,chapters:new Set(passages.map(p=>p.chapterId)).size,blocks:corpus.units.reduce((n,u)=>n+u.blocks.length,0),figures:corpus.images?.length??0,overBudgetUnits:passages.filter(p=>p.content.length>6000).length,navigationUnits:passages.filter(p=>p.contentRole!=='instruction').length}};
}
export async function snapshotTextbook(out,source=DEFAULT_SNAPSHOT){
  const destination=join(out,'textbook');await mkdir(destination,{recursive:true});
  const files={},corpus=await read(join(source,'textbook-corpus.json'));
  // Existing strict corpus validation remains the textbook owner's authority.
  const {validateTextbookCorpus}=await import('@riichi-coach/desktop/textbook-knowledge');validateTextbookCorpus(corpus);
  for(const file of ['textbook-corpus.json','textbook-bodies.json','knowledge-index.json','accepted-preview-receipt.json',...corpus.images.map(i=>i.path)]){
    const abs=resolve(source,file),rel=relative(resolve(source),abs);
    if(isAbsolute(rel)||rel==='..'||rel.startsWith('..'+sep))throw Error('textbook_snapshot_path_escape');
    const bytes=await readFile(abs),digest=hash(bytes);files[file]=digest;
    if(file==='textbook-bodies.json'&&digest!==corpus.bodySha256)throw Error('textbook_source_body_changed');
    const image=corpus.images.find(i=>i.path===file);if(image&&digest!==image.sha256)throw Error('textbook_source_image_changed');
    await mkdir(resolve(destination,file,'..'),{recursive:true});
    try{const {writeFile}=await import('node:fs/promises');await writeFile(join(destination,file),bytes,{flag:'wx'});}catch(e){if(e.code!=='EEXIST'||hash(await readFile(join(destination,file)))!==digest)throw e;}
  }
  const index=indexTextbook(corpus);
  if(index.counts.chapters!==232||index.counts.units!==240)throw Error('wrong_approved_textbook_snapshot');
  await writeOnce(join(destination,'index.json'),index);
  const manifest={version:'ceiling-textbook-snapshot/v1',source,corpusId:corpus.corpusId,bodySha256:corpus.bodySha256,reviewStatus:corpus.reviewStatus,files,counts:index.counts};
  await writeOnce(join(destination,'manifest.json'),manifest);return {index,manifest};
}

const ROUTES={pairs:['七对子','对子','面子手'],chiitoitsu:['七对子','路线'],yakuhai:['役牌','对子'],flush:['混一色','清一色','染手'],efficiency:['牌效率','进张','向听','孤张','搭子'],dora:['宝牌','打点'],waits:['听牌','等待','好形'],furiten:['振听'], 'riichi-defense':['立直','防守','现物'], 'multi-defense':['多家','防守','安全牌'], 'safe-tiles':['现物','安全牌','筋'], 'open-defense':['副露','鸣牌','防守'],reading:['读牌','牌河'], 'push-fold':['押引','攻守','防守'],endgame:['终盘','流局','听牌'],placement:['南四','点数','顺位']};
export const VERSIONS=[{id:'V0',ruleCount:18,round:0,description:'18模式＋原词项排序'},{id:'r1',ruleCount:18,round:1,description:'教材主题别名与标题匹配增强'},{id:'r2',ruleCount:18,round:2,description:'威胁、点况、振听优先及跨主题覆盖'},{id:'r3',ruleCount:20,round:3,description:'加入手役未确定、无明显威胁效率；资料不足另作事实提醒'}];
export function sceneTopics(facts,version='V0'){
  const packet=matchScenePatterns(facts),hits=packet.results.filter(p=>p.status==='matched');
  const topics=[...new Set(hits.flatMap(p=>p.topics))];
  const extra=[];
  if(version==='r3'){
    if(facts.acceptedRiichiActors?.length===0&&facts.opponents.every(o=>o.openMeldCount!==null&&o.openMeldCount<2&&o.exposedYakuhai===false&&o.exposedDora!==null&&o.exposedDora<2))extra.push({id:'X01',question:'没有已确认的立直或明显副露威胁，先比较同向听进张与牌形；不据此断言绝对安全。',topics:['efficiency'],sourceTerms:['牌效率','进张']});
    if(facts.noMeldOrKan===true&&facts.candidates.some(c=>c.chiitoitsuShanten!==null&&c.standardShanten!==null&&c.chiitoitsuShanten===c.standardShanten))extra.push({id:'X02',question:'七对子与一般形进度相同，检查是否过早确定路线及保留兼顾的代价。',topics:['pairs','chiitoitsu'],sourceTerms:['七对子','面子手']});
    if(packet.results.some(p=>p.status==='insufficient_data'))extra.push({id:'X03',question:'部分场景资料不足，保留未知，不把未知条件当作不成立。',topics:[],sourceTerms:[]});
  }
  return {hits:hits.map(p=>p.patternId),topics:[...new Set([...topics,...extra.flatMap(p=>p.topics)])],text:packet.text+(extra.length?'\n'+extra.map(x=>`${x.id}：${x.question}`).join('\n'):''),extra};
}
export function factQuery(facts){
  const terms=['弃牌','牌效率','进张'];
  if(facts.candidates.some(c=>c.shanten===0))terms.push('听牌','等待');
  if(facts.acceptedRiichiActors?.length)terms.push('立直','防守','押引','安全牌');
  if(facts.opponents.some(o=>o.openMeldCount>=2))terms.push('副露','防守');
  if(facts.southFourHanchan===true)terms.push('南四','顺位','点数');
  if(facts.selfDora>=2)terms.push('宝牌');
  return terms.join(' ');
}
const cachedTerms=new WeakMap();
export function retrieveTextbook(index,{query,topics=[]},version='V0'){
  const terms=tokenize(query),expanded=version==='V0'?[]:[...new Set(topics.flatMap(t=>ROUTES[t]??[]))];
  const weights=Object.fromEntries(topics.map(t=>[t,['riichi-defense','multi-defense','safe-tiles','push-fold','placement','furiten'].includes(t)?3:1]));
  if(!cachedTerms.has(index))cachedTerms.set(index,index.passages.filter(p=>p.contentRole==='instruction').map(p=>({p,body:new Set(tokenize(p.content)),title:new Set(tokenize(p.title+' '+p.chapterTitle+' '+p.topics.join(' ')))})));
  const ranked=cachedTerms.get(index).map(({p,body,title})=>{
    const lexical=terms.reduce((n,t)=>n+Number(body.has(t))*2+Number(title.has(t)),0);
    const matches=topics.filter(t=>(ROUTES[t]??[]).some(w=>(p.title+' '+p.chapterTitle+' '+p.topics.join(' ')).includes(w)));
    const alias=expanded.reduce((n,t)=>n+(p.content.includes(t)?1:0)+(p.title.includes(t)?3:0),0);
    const priority=version==='r2'||version==='r3'?matches.reduce((n,t)=>n+weights[t]*8,0):0;
    return {p,score:lexical+alias+priority,matches};
  }).filter(x=>x.score>0).sort((a,b)=>b.score-a.score||a.p.id.localeCompare(b.p.id));
  const selected=[],rejected=[],covered=new Set();let characters=0;
  while(ranked.length&&selected.length<6){
    if(version==='r2'||version==='r3')ranked.sort((a,b)=>(b.score+b.matches.filter(t=>!covered.has(t)).length*15)-(a.score+a.matches.filter(t=>!covered.has(t)).length*15)||a.p.id.localeCompare(b.p.id));
    const {p,score,matches}=ranked.shift();
    if(p.content.length>6000){rejected.push({id:p.id,reason:'whole_argument_over_budget',characters:p.content.length});continue;}
    if(characters+p.content.length>6000){rejected.push({id:p.id,reason:'remaining_context_budget'});continue;}
    selected.push({...p,score});characters+=p.content.length;matches.forEach(t=>covered.add(t));
  }
  return {passages:selected,characters,rejected,query,topics,version,indexedUnits:index.passages.length,noHits:selected.length===0};
}
