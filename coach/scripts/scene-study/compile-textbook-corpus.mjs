import {readFile,writeFile,realpath} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {join,resolve,relative,isAbsolute,sep} from 'node:path';
import {pathToFileURL} from 'node:url';
import {TextbookUnitSchema} from '@riichi-coach/contracts';
import {textbookCorpusId,validateTextbookCorpus} from '@riichi-coach/desktop/textbook-knowledge';
import {validateLibrary,validateBodies} from './textbook-review.mjs';
const sha=x=>createHash('sha256').update(x).digest('hex');

export async function compileTextbookCorpus(directory){
 const root=await realpath(directory),library=validateLibrary(JSON.parse(await readFile(join(root,'knowledge-index.json'),'utf8')));
 const bytes=await readFile(join(root,'textbook-bodies.json')),bodies=validateBodies(library,JSON.parse(bytes));
 const definitions=JSON.parse(await readFile(new URL('./textbook-units.json',import.meta.url),'utf8'));
 const units=[],images=[],used=new Set();
 for(const d of definitions){
  const chapter=library.chapters.find(c=>c.id===d.chapterId),body=bodies.chapters.find(c=>c.chapterId===d.chapterId);
  if(!chapter||!body||d.from<1||d.to>body.blocks.length||d.to<d.from)throw Error('textbook_unit_range');
  const siblings=definitions.filter(x=>x.chapterId===d.chapterId),at=siblings.indexOf(d),source=library.sources.find(s=>s.id===chapter.sourceId),blocks=[];
  for(const b of body.blocks.slice(d.from-1,d.to)){
   if(used.has(b.id))throw Error('textbook_duplicate_block');used.add(b.id);
   if(b.type==='figure'){
    const full=await realpath(join(root,b.src)),rel=relative(root,full);
    if(isAbsolute(rel)||rel==='..'||rel.startsWith('..'+sep))throw Error('textbook_image_outside_root');
    const imageSha256=sha(await readFile(full));
    images.push({figureId:b.id,path:b.src,sha256:imageSha256});
    const transcription=b.hand||b.tableText?{...(b.hand?{hand:b.hand,decision:b.decision,...(b.conditions?{conditions:b.conditions}:{})}:{}),...(b.tableText?{table:b.tableText}:{})}:null;
    blocks.push({type:'figure',id:b.id,page:b.page,figure:{figureId:b.id,unitId:d.id,page:b.page,caption:b.caption,imageSha256,transcription,requiresImageForFullExample:transcription===null}});
   }else blocks.push({type:b.type,id:b.id,page:b.page,...(b.type==='list'?{items:b.items}:{text:b.text})});
  }
  units.push(TextbookUnitSchema.parse({unitId:d.id,chapterId:d.chapterId,title:d.title,chapterTitle:chapter.title,topics:chapter.topics,
   source:{sourceId:source.id,title:source.title,sha256:source.sha256,pages:[...new Set(blocks.map(b=>b.page))]},translationStatus:body.translationStatus,
   previousUnitId:siblings[at-1]?.id??null,nextUnitId:siblings[at+1]?.id??null,blocks}));
 }
 if(used.size!==bodies.chapters.reduce((n,c)=>n+c.blocks.length,0))throw Error('textbook_unindexed_body');
 const data={schema:'coach-textbook-corpus/1',bodySha256:sha(bytes),reviewStatus:'text-extraction-accepted-content-review-pending',units,images};
 const corpus=validateTextbookCorpus({...data,corpusId:textbookCorpusId(data)});
 await writeFile(join(root,'textbook-corpus.json'),JSON.stringify(corpus,null,2)+'\n');
 const receipt={chapters:library.chapters.length,units:units.length,blocks:used.size,figures:images.length,corpusId:corpus.corpusId,bodySha256:corpus.bodySha256,maxUnitBytes:Math.max(...units.map(u=>Buffer.byteLength(JSON.stringify(u)))),modelCalls:0};
 await writeFile(join(root,'mcp-build.json'),JSON.stringify(receipt,null,2)+'\n');return receipt;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){if(!process.argv[2])throw Error('Usage: compile-textbook-corpus.mjs LIBRARY_DIRECTORY');console.log(JSON.stringify(await compileTextbookCorpus(process.argv[2])));}
