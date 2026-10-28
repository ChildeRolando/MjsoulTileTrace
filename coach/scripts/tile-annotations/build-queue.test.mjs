import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { buildQueue } from './build-queue.mjs';
import { sha256 } from './server.mjs';

test('queue uses accepted revisions, filters non-tile unknowns, deduplicates and preserves source binding', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'coach-queue-test-'));
  const write = (file, obj) => { const p = path.join(root,file);fs.mkdirSync(path.dirname(p),{recursive:true});fs.writeFileSync(p,JSON.stringify(obj));return sha256(fs.readFileSync(p)); };
  try {
    fs.mkdirSync(path.join(root,'web-sources/v1'),{recursive:true});
    const image = Buffer.from('independent fixture'), imageSha = sha256(image);
    fs.writeFileSync(path.join(root,'web-sources/v1/image.png'),image);
    const sourcePath = 'source.json';
    const sourceSha = write(sourcePath,{title:'fixture',blocks:[{id:'block',images:[{assetId:'asset'}]}],assets:[{assetId:'asset',sha256:imageSha,path:'image.png'}]});
    const fig = { figureId:'figure',sourceBlockIds:['block'],sourceAssetBindings:[{assetId:'asset',sha256:imageSha}],unknowns:['左方牌河第1张万子点数不清。','三家隐藏手牌无法看见。','和牌率及放铳率精确数值未知。','作者姓名不明。'],transcription:'fixture' };
    const candidate = {source:{sourcePath,sourceSha256:sourceSha,articleId:'article'},body:{blocks:[]},figures:[fig]};
    const candidateSha = write('accepted.json',candidate);
    const acceptedRef = {candidatePath:'accepted.json',candidateSha256:candidateSha,chapterIds:['canonical-fixture']};
    write('integration/accepted-preview-current.json',{selectedWeb:[acceptedRef,acceptedRef]});
    write('integration/current-web-candidate-selection.json',{candidates:[],pending:[]});
    write('integration/current-candidate-selection.json',{pages:[]});
    write('integration/coac250-unified-chapter-register-20261027b.json',{rows:[{chapterId:'canonical-fixture',covered:true,existingCandidate:{path:'OLD-DO-NOT-READ.json'},approvedWebCorrespondence:{articleId:'article'}}]});
    write('integration/coac244-remaining26-closure-register-20261028.json',{rows:[]});
    write('integration/coac250-uncovered-chapter-continuation-register-20261027b.json',{rows:[]});
    let queue = buildQueue(root);
    assert.deepEqual(queue.counts,{total:1,blocking:0,nonblocking:1});
    assert.equal(queue.items[0].imageSha256,imageSha);
    const stableId = queue.items[0].id;
    assert.equal(buildQueue(root).items[0].id,stableId);
    // A real error about a different part of the same scene must not vanish just because an
    // unrelated unknown exists (e.g. declaration direction vs another player's unknown tile).
    write('audit.json',{modelReview:{issues:[{targetId:'figure',severity:'error',description:'北家横置牌遗漏，立直宣言方向错误。',sourceEvidence:'北家牌河有横置牌。'}]}});
    write('integration/accepted-preview-current.json',{selectedWeb:[]});
    write('integration/coac250-unified-chapter-register-20261027b.json',{rows:[{chapterId:'canonical-fixture',covered:false,existingCandidate:{path:'accepted.json',sha256:candidateSha,auditPath:'audit.json'}}]});
    queue = buildQueue(root);
    assert.equal(queue.counts.blocking,2);
    assert.equal(queue.items.some(i=>i.targetId.includes(':dispute:')),true);
    candidate.figures[0].sourceAssetBindings[0].sha256 = '0'.repeat(64);
    write('accepted.json',candidate);
    write('integration/coac250-unified-chapter-register-20261027b.json',{rows:[{chapterId:'canonical-fixture',covered:false,existingCandidate:{path:'accepted.json',auditPath:'audit.json'}}]});
    assert.throws(()=>buildQueue(root),/图片未绑定源靶点/);
  } finally {fs.rmSync(root,{recursive:true,force:true});}
});
