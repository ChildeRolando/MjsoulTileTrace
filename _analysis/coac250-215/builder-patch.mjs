export function updateBuilder(before,selectionSha){
 const once=(a,b)=>{if(before.split(a).length!==2)throw Error('builder patch target '+a);before=before.replace(a,b);};
 once('specific-web-variant-selection.v21.json','specific-web-variant-selection.v22.json');
 once('ca4af6ef8ecaefd2a9bef3efdc42357b6c33da78fafd5a0e1c14b7b3be12a786',selectionSha);
 once("const pdfReady=await load(join(root,'integration/ready-pdf-gap-chapters.json')),pdfStages=[],pendingPdf=[];",`const pdfScopeSelectionBytes=await readFile(join(root,'integration/specific-web-variant-selection.v22.json'));if(sha(pdfScopeSelectionBytes)!=='${selectionSha}')throw Error('pdf_scope_selection_changed');const pdfScopeSelections=JSON.parse(pdfScopeSelectionBytes).pdfScopes??[];if(pdfScopeSelections.length!==1||pdfScopeSelections[0].chapterId!=='79-cn-chapter-215-4')throw Error('pdf_scope_not_215');
const pdfReady=await load(join(root,'integration/ready-pdf-gap-chapters.json')),pdfStages=[],pendingPdf=[];if(pdfReady.ready.some(r=>pdfScopeSelections.some(s=>s.chapterId===r.chapterId)))throw Error('duplicate_pdf_scope_selection');`);
 once('for(const requested of pdfReady.ready){','for(const requested of [...pdfReady.ready,...pdfScopeSelections]){');
 once('try{pdfStage=await stagePdfChapters(',"try{const ownedScope=pdfScopeSelections.find(s=>s.chapterId===requested.chapterId);if(ownedScope){if(sha(await readFile(ownedScope.module.path))!==ownedScope.module.sha256)throw Error('owned215_module_changed');const {stageOwned215}=await import(pathToFileURL(ownedScope.module.path));pdfStage=await stageOwned215({processingRoot:root,destination:pdfDestination,sourceLibraryPath:join(formal,'knowledge-index.json'),binding:ownedScope});}else pdfStage=await stagePdfChapters(");
 once('selectedPdf:{stages:pdfStages,pending:pendingPdf,scopeManifest:pdfReady}', 'selectedPdf:{stages:pdfStages,pending:pendingPdf,scopeManifest:pdfReady,scopeSelections:pdfScopeSelections}');
 return before;
}
