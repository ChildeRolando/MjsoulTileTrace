import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { read,save,hash } from './common.mjs';
export async function buildKnowledge(sources,destination) {
  const text=await readFile(new URL('./cards.tsv',import.meta.url),'utf8');
  const cards=[];
  for(const line of text.trim().split(/\r?\n/)) {
    const [id,title,topics,concept,conditions,exceptions]=line.split('|'),source=await read(join(sources,id+'.json'));
    if(!exceptions||!source.sha256||!source.title)throw new Error('knowledge_source_incomplete');
    const body=`概念：${concept}\n适用条件：${conditions}\n例外与限制：${exceptions}\n版本：${id[0]==='a'?'现代麻雀技术论旧网页版，与书版有差异':'Beginner’s Luck原始网页'}。仅整理可独立核对的文字论述；未确认的牌图例题未收录。`;
    if(body.length<200||body.length>400)throw new Error(`knowledge_card_length:${id}:${body.length}`);
    cards.push({id,title,topics:topics.split(','),concept,conditions,exceptions,content:body,source:{system:id[0]==='a'?'nemata-original-web':'beginners-luck-original-web',title:source.title,url:source.url,chapter:new URL(source.url).pathname,htmlSha256:source.sha256},tileExamples:[],imagePolicy:'unverified_examples_excluded',editorialStatus:'source_read_summary_needs_domain_review'});
  }
  if(cards.length!==40)throw new Error('knowledge_card_count');
  const knowledge={version:'coach-scene-knowledge-web/v1',frozenAt:new Date().toISOString(),versionNotice:'网页版知识集，不代表新版书籍。两套观点分别保存；a16原文公式不等号笔误未复制。',cards};
  await save(destination,knowledge);return knowledge;
}
export function arenaCorpus(knowledge) {
  return {corpusVersion:knowledge.version,passages:knowledge.cards.map(c=>({id:c.id,sourceId:c.source.system,sourceTitle:`${c.title} / ${c.source.title}`,documentLocation:c.source.chapter,localSourcePath:'scripts/scene-study/knowledge.json#'+c.id,attributedReferences:[c.source.url],rightsBasis:'根据原始网页自行撰写中文概括，保留来源和条件；不转载图例或原文全文。',topics:c.topics,applicableWhen:['general-discard-choice'],content:c.content}))};
}
export const knowledgeDigest=knowledge=>hash(knowledge);
