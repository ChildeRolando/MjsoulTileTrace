import {readFile,readdir,writeFile} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {KNOWLEDGE_TOPICS} from '@riichi-coach/contracts';
import {read,save,exists,hash} from './common.mjs';
const names=['对子路线','七对子','役牌','染手','牌效','宝牌','等待','振听','立直防守','多家防守','副露防守','读牌','安全牌','押引','终盘','点况'];
const name=t=>names[KNOWLEDGE_TOPICS.indexOf(t)];
export async function summarizeAnnotations(out){
  const draft=await read(join(out,'automatic-draft.json')),status=await read(join(out,'automatic/status.json')),dataset=await read(join(out,'dataset.json')),knowledge=await read(join(out,'knowledge.json'));
  if(draft.datasetHash!==hash(dataset)||draft.knowledgeHash!==hash(knowledge))throw new Error('annotation_summary_binding');
  const cases=dataset.cases.filter(c=>c.split==='evaluation');
  const rows=draft.cases.map((c,i)=>({...c,ordinal:i+1,stratum:cases.find(x=>x.id===c.caseId).stratum}));
  const topics=KNOWLEDGE_TOPICS.map(topic=>({topic,name:name(topic),required:rows.filter(c=>c.topics.some(t=>t.topic===topic&&t.need==='required')).length,optional:rows.filter(c=>c.topics.some(t=>t.topic===topic&&t.need==='optional')).length,irrelevant:rows.filter(c=>c.topics.some(t=>t.topic===topic&&t.need==='irrelevant')).length,lowConfidence:rows.filter(c=>c.topics.some(t=>t.topic===topic&&t.confidence==='low')).length}));
  const gaps=rows.flatMap(c=>c.topics.filter(t=>t.need==='required'&&t.gap).map(t=>({caseId:c.caseId,ordinal:c.ordinal,stratum:c.stratum,topic:t.topic,reason:t.reason})));
  const uncertain=rows.filter(c=>c.topics.some(t=>t.need==='required'&&t.confidence==='low')).map(c=>({caseId:c.caseId,ordinal:c.ordinal,topics:c.topics.filter(t=>t.need==='required'&&t.confidence==='low').map(t=>t.topic)}));
  const archived=[];const archiveDir=join(out,'automatic-revisions');
  if(await exists(join(archiveDir,'v1-missing-rule-config/manifest.json'))){const dir=join(archiveDir,'v1-missing-rule-config/runs');for(const n of await readdir(dir))if(n.endsWith('.json')&&!n.endsWith('.started.json'))archived.push(await read(join(dir,n)));}
  const retries=[];for(const attempt of [1,2]){const dir=join(out,'automatic/retries',`attempt-${attempt}`);if(await exists(join(dir,'receipt.json')))for(const n of await readdir(dir))if(n.endsWith('.json')&&!n.endsWith('.started.json')&&n!=='receipt.json')retries.push(await read(join(dir,n)));}
  const firstFailures=new Set([...retries.map(r=>r.caseId),...status.failed.map(r=>r.caseId)]);
  const formalGenerations=(await readdir(join(out,'runs'))).filter(n=>n.startsWith('evaluation-')&&n.endsWith('.json')&&!n.endsWith('.started.json')).length;
  const humanBlindReviews=await exists(join(out,'ratings.json'))?(await read(join(out,'ratings.json'))).cases.length:0;
  const report={kind:'automatic_annotation_preview_not_expert_evaluation',model:draft.annotationSource,counts:status,firstPassFailures:firstFailures.size,retriedFailures:retries.map(r=>({caseId:r.caseId,status:r.status,usage:r.result?.usage??'unknown'})),topics,gaps,uncertain,archivedEarlierAttempts:archived.map(r=>({caseId:r.caseId,status:r.status,usage:r.result?.usage??'unknown'})),formalGenerations,humanBlindReviews};
  await save(join(out,'automatic-preview-report.json'),report);
  const text=`# 60 局自动知识需求标注预览\n\n当前完成 ${status.completed}/60，失败 ${status.failed.length}。模型 gpt-6.1-sol，推理强度 high。这是自动草稿，尚未人工复核；模型的把握程度不是校准后的概率。\n\n请打开 review/knowledge-needs-60.html 查看牌面、逐主题理由与章节多选。规则、四家公开场面、自家手牌、确定性候选事实及 40 张卡片进入标注输入；没有模式输出、生成讲解、实际结果或 Mortal 标签。\n\n已报告 ${status.reportedTotalTokens.toLocaleString('en-US')} tokens，${status.knownTokenRuns}/${status.attempted} 次有用量报告；每局平均 ${(status.meanElapsedMs/1000).toFixed(1)} 秒。早期输入修正版之前的 ${archived.length} 次尝试单独保留，不混入本批完成数。\n\n## 主题分布\n\n|主题|必须|可选|不适用|低把握|\n|---|---:|---:|---:|---:|\n${topics.map(t=>`|${t.name}|${t.required}|${t.optional}|${t.irrelevant}|${t.lowConfidence}|`).join('\n')}\n\n## 优先核对\n\n模型认为 ${new Set(gaps.map(g=>g.caseId)).size} 个局面、${gaps.length} 项必须主题存在知识缺口。这些判断可能需要修正，不能直接当作教材覆盖率结论。\n\n${gaps.map(g=>`- 局面 ${g.ordinal} · ${name(g.topic)}：${g.reason}`).join('\n')||'暂无模型标出的必须主题缺口。'}\n\n必须主题中有低把握标记的局面：${uncertain.map(c=>c.ordinal).join('、')||'暂无'}。\n\n## 当前边界\n\n自动草稿保留空的人工评审姓名，未导入 gold.json。正式四组 240 份讲解及 48 局人工盲评尚未执行；本页不报告模式准确率、检索增益或专家讲解有效性，也不据此修改冻结规则或知识卡。\n`;
  await writeFile(join(out,'AUTO_ANNOTATION_REPORT.md'),text.replace('## 主题分布',`首次尝试有 ${firstFailures.size} 个局面失败；已归档 ${retries.length} 次失败后补跑记录。上述用量只统计每局当前保留的那次尝试；早期失败用量（含未知值）另列于 JSON，不隐去超时成本。\n\n## 主题分布`).replace('正式四组 240 份讲解及 48 局人工盲评尚未执行',`正式生成 ${formalGenerations}/240，人工盲评 ${humanBlindReviews}/48`),'utf8');return report;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)await summarizeAnnotations(resolve(process.argv[2]));
