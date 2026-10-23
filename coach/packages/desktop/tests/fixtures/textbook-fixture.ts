import {createHash} from "node:crypto";
import {mkdtemp,mkdir,writeFile,rm} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join,resolve,sep} from "node:path";
import {textbookCorpusId,type TextbookCorpus} from "../../src/textbook-knowledge.js";
export const png=Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jG1sAAAAASUVORK5CYII=","base64");
export const digest=(x:string|Buffer)=>createHash("sha256").update(x).digest("hex");
export function fixtureCorpus():TextbookCorpus {
 const data:Omit<TextbookCorpus,"corpusId">={schema:"coach-textbook-corpus/1",bodySha256:digest("fixture body"),reviewStatus:"text-extraction-accepted-content-review-pending",units:[{
  unitId:"pairs-route",chapterId:"pairs",title:"七对子转对对和",chapterTitle:"对子手",topics:["七对子","对对和"],source:{sourceId:"source-cn",title:"测试中文教材",sha256:"1".repeat(64),pages:[1,2]},translationStatus:"existing-chinese-edition-transcribed",previousUnitId:null,nextUnitId:null,
  blocks:[{type:"p",id:"pairs-b1",page:1,text:"七对子一向听转对对和，要求对子容易碰、有打点、巡目尚早。"},
    {type:"figure",id:"pairs-b2",page:1,figure:{figureId:"pairs-b2",unitId:"pairs-route",page:1,caption:"完整原牌例",imageSha256:digest(png),transcription:null,requiresImageForFullExample:true}},
    {type:"p",id:"pairs-b3",page:2,text:"以上条件需要同时考虑；有见尽的对子时不能照搬该牌例。"}]
 },{
  unitId:"open-threat",chapterId:"defense",title:"副露防守",chapterTitle:"防守",topics:["副露"],source:{sourceId:"source-cn",title:"测试中文教材",sha256:"1".repeat(64),pages:[3]},translationStatus:"existing-chinese-edition-transcribed",previousUnitId:null,nextUnitId:null,
  blocks:[{type:"p",id:"defense-b1",page:3,text:"副露手的打点和听牌判断。"}]
 }],images:[{figureId:"pairs-b2",path:"assets/example.png",sha256:digest(png)}]};
 return {...data,corpusId:textbookCorpusId(data)};
}
export async function writeFixtureCorpus(){
 const directory=await mkdtemp(join(tmpdir(),"coach-textbook-"));await mkdir(join(directory,"assets"));
 await writeFile(join(directory,"textbook-corpus.json"),JSON.stringify(fixtureCorpus()));
 await writeFile(join(directory,"textbook-bodies.json"),"fixture body");await writeFile(join(directory,"assets/example.png"),png);
 return {directory,async cleanup(){const path=resolve(directory);if(!path.startsWith(resolve(tmpdir())+sep)||!path.includes("coach-textbook-"))throw Error("unsafe_test_cleanup");await rm(path,{recursive:true,force:true});}};
}
