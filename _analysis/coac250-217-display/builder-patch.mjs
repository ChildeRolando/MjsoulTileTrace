import assert from 'node:assert/strict';
export function updateBuilder(text,newSha,oldSha){
 assert.equal((text.match(/specific-web-variant-selection\.v28\.json/g)??[]).length,2);assert.equal(text.split(oldSha).length-1,2);
 text=text.replaceAll('specific-web-variant-selection.v28.json','specific-web-variant-selection.v29.json').replaceAll(oldSha,newSha);
 const old="if(pdfScopeSelections.length!==1||pdfScopeSelections[0].chapterId!=='79-cn-chapter-215-4')throw Error('pdf_scope_not_215');";
 assert(text.includes(old));text=text.replace(old,"if(pdfScopeSelections.length!==2||pdfScopeSelections[0].chapterId!=='79-cn-chapter-215-4'||pdfScopeSelections[1].chapterId!=='79-cn-chapter-217-4')throw Error('pdf_scope_not_215_217');");
 const route="const {stageOwned215}=await import(pathToFileURL(ownedScope.module.path));pdfStage=await stageOwned215(";
 assert(text.includes(route));text=text.replace(route,"const scopedModule=await import(pathToFileURL(ownedScope.module.path)),stageOwned=ownedScope.chapterId==='79-cn-chapter-217-4'?scopedModule.stageOwned217:scopedModule.stageOwned215;pdfStage=await stageOwned(");return text;
}
