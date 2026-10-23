import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {join,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {TextbookDiagramSchema} from '@riichi-coach/contracts';
import {validateLibrary,validateBodies} from './textbook-review.mjs';

export function verifyFigureTranscription(entry,block,bytes){
 if(entry.id!==block.id||entry.path!==block.src||block.type!=='figure')throw Error('figure_transcription_binding');
 if(createHash('sha256').update(bytes).digest('hex')!==entry.sha256)throw Error('figure_transcription_image_changed');
 return TextbookDiagramSchema.parse(entry.diagram);
}
export async function applyFigureTranscriptions(directory){
 const manifest=JSON.parse(await readFile(new URL('./textbook-figure-transcriptions.json',import.meta.url),'utf8'));
 const library=validateLibrary(JSON.parse(await readFile(join(directory,'knowledge-index.json'),'utf8')));
 const body=validateBodies(library,JSON.parse(await readFile(join(directory,'textbook-bodies.json'),'utf8')));
 if(manifest.schema!=='coach-textbook-figure-transcriptions/1'||manifest.figures.length!==22||new Set(manifest.figures.map(f=>f.id)).size!==22)throw Error('figure_transcription_manifest');
 const checks=[];
 for(const e of manifest.figures){
  const block=body.chapters.flatMap(c=>c.blocks).find(b=>b.id===e.id);
  if(!block)throw Error('figure_transcription_block_missing');
  block.diagram=verifyFigureTranscription(e,block,await readFile(join(directory,block.src)));
  block.requiresImage=false;
  checks.push({figureId:e.id,imageSha256:e.sha256,knownTilesAndUnknownCountChecked:true,source:'assistant-visual-inspection-with-adjacent-text'});
 }
 const figures=body.chapters.flatMap(c=>c.blocks).filter(b=>b.type==='figure');
 if(figures.some(b=>!b.diagram&&!b.hand&&!b.tableText))throw Error('figure_transcription_incomplete');
 const serialized=JSON.stringify(body,null,2)+'\n';
 await writeFile(join(directory,'textbook-bodies.json'),serialized);
 const receipt={checkedAt:new Date().toISOString(),bodySha256:createHash('sha256').update(serialized).digest('hex'),notation:manifest.notation,addedDiagrams:checks,figuresWithText:figures.length,imageOnlyFigures:0,modelExperimentCalls:0,modelExperimentTokens:0};
 await writeFile(join(directory,'figure-transcription-validation.json'),JSON.stringify(receipt,null,2)+'\n');
 const sections=manifest.figures.map(e=>{
  const b=body.chapters.flatMap(c=>c.blocks).find(b=>b.id===e.id),d=e.diagram;
  return `## ${b.caption}\n\n![${b.caption}](${join(directory,b.src).replaceAll('\\','/')})\n\n`+
   `- 图示暗手：${d.concealed||'未公开'}；未知暗手：${d.hiddenTileCount} 张。\n`+
   `- 单独摸牌：${d.drawn||'图中未单列'}。\n`+
   `- 副露（从左到右）：${d.melds.map(m=>`${m.kind==='chi'?'吃':'碰'} ${m.tiles}（第 ${m.calledIndex+1} 张横置）`).join('；')||'无'}。\n`+
   `- 宝牌栏：${d.doraDisplay||'本图未画出'}。\n`+
   `- 图示说明：${d.notes}\n`;
 });
 await writeFile(join(directory,'牌例编码核对.md'),`# 22 幅牌图的编码与核对\n\n${manifest.notation}\n\n${manifest.verification}\n\n7 幅图保留未知暗手；不会从副露补猜牌背。原文论证保持不变。\n\n${sections.join('\n')}`);
 return receipt;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 if(!process.argv[2])throw Error('Usage: apply-textbook-figure-transcriptions.mjs LIBRARY_DIRECTORY');
 const r=await applyFigureTranscriptions(resolve(process.argv[2]));console.log(JSON.stringify({addedDiagrams:r.addedDiagrams.length,figuresWithText:r.figuresWithText,imageOnlyFigures:r.imageOnlyFigures,modelExperimentCalls:0}));
}
