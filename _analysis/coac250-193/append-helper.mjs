// Bounded source+parent+slice dedupe for the two PDF193 version sentences only.
export function appendPdf193Supplement({library,bodies,definitions,stageLibrary,stageBodies,stageDefinitions,binding}){
 assert.equal(binding.chapterId,'79-cn-chapter-193-4-pdf193-supplement');assert.equal(binding.supplementOf,'79-cn-chapter-193-4');assert.equal(binding.contentRole,'navigation');
 assert.equal(createHash('sha256').update(JSON.stringify(binding.sourceIdentity)).digest('hex'),binding.dedupeKey);
 assert.equal(stageLibrary.chapters.length,1);assert.equal(stageLibrary.chapters[0].id,binding.chapterId);assert.equal(stageLibrary.chapters[0].supplementOf,binding.supplementOf);assert.equal(stageDefinitions.length,1);assert.equal(stageDefinitions[0].contentRole,'navigation');assert.equal(stageBodies.chapters[0].blocks.length,2);
 const target=stageBodies.chapters[0];assert.equal(target.sourceSha256,binding.sourceIdentity.sourcePdfSha256);
 for(const [i,b]of target.blocks.entries()){assert.deepEqual(b.sourceBlockIds,['79-cn-p193-b6']);assert.equal(b.sourceTextSlice.parentCandidateSha256,binding.sourceIdentity.parentSha256);assert.deepEqual([b.sourceTextSlice.fromCodepoint,b.sourceTextSlice.toCodepoint],binding.sourceIdentity.slices[i]);}
 const existing=bodies.chapters.find(c=>c.chapterId===binding.chapterId);
 if(existing){assert.deepEqual(existing,target);assert.deepEqual(library.chapters.find(c=>c.id===binding.chapterId),stageLibrary.chapters[0]);assert.deepEqual(definitions.find(d=>d.chapterId===binding.chapterId),stageDefinitions[0]);return {appended:false,reason:'same-source-parent-slices-already-present',dedupeKey:binding.dedupeKey};}
 const included=target.blocks.map(t=>bodies.chapters.some(c=>c.sourceId==='79-cn'&&c.sourceSha256===target.sourceSha256&&c.blocks.some(b=>b.sourceBlockIds?.includes('79-cn-p193-b6')&&b.text?.includes(t.text)&&(!b.sourceTextSlice||b.sourceTextSlice.parentCandidateSha256===binding.sourceIdentity.parentSha256))));
 if(included.every(Boolean))return {appended:false,reason:'same-parent-source-sentences-already-in-body',dedupeKey:binding.dedupeKey};assert(!included.some(Boolean),'partial PDF193 slice overlap');
 for(const source of stageLibrary.sources){const prior=library.sources.find(s=>s.id===source.id);if(prior)assert.deepEqual(prior,source);else library.sources.push(source);}
 library.chapters.push(...stageLibrary.chapters);bodies.chapters.push(...stageBodies.chapters);definitions.push(...stageDefinitions);return {appended:true,dedupeKey:binding.dedupeKey};
}
