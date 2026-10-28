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

test('latest exact reviews prioritize unresolved 109/167 and retain 201 as nonblocking without reviving repaired targets', () => {
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'coach-exact-queue-'));
  const write=(file,value)=>{const p=path.join(root,file);fs.mkdirSync(path.dirname(p),{recursive:true});fs.writeFileSync(p,JSON.stringify(value));return {path:file,sha256:sha256(fs.readFileSync(p))};};
  try {
    fs.mkdirSync(path.join(root,'web-sources/v1'),{recursive:true});
    const image=Buffer.from('isolated exact review fixture');fs.writeFileSync(path.join(root,'web-sources/v1/image.png'),image);
    const imageSha=sha256(image), rows=[], selections=[];
    for(const [key,article,positions] of [
      ['109','cv1729038',['上方弃牌区从左至右第4张为万子，具体点数无法可靠辨认。','左方弃牌区从上至下第1张为万子，具体点数无法可靠辨认。','右方弃牌区从上至下第6张为字牌，具体字样无法可靠辨认。']],
      ['167','cv1754620',['右侧南家牌河按画面从上到下第5行、从左到右第3列：可确认是万子牌，但数字无法可靠辨清。']],
      ['201','cv1770179',['右侧北家牌河靠中央第一列最下方万子的点数无法可靠辨清，记为?m。']],
    ]) {
      const canonical=`79-cn-chapter-${key}-${key==='201'?'6':'4'}`, block=`79-bilibili-cn:${article}:b${key==='109'?'0012':'0005'}`, figureId=block+':figure';
      const source=write(`${article}-source.json`,{blocks:[{id:block,images:[{assetId:'asset'}]}],assets:[{assetId:'asset',sha256:imageSha,path:'image.png'}]});
      const candidate={source:{sourceId:'79-bilibili-cn',articleId:article,sourcePath:source.path,sourceSha256:source.sha256},body:{blocks:[]},figures:[{figureId,sourceBlockIds:[block],sourceAssetBindings:[{assetId:'asset',sha256:imageSha}],unknowns:positions}]};
      let reviewImage={path:'web-sources/v1/image.png',sha256:imageSha};
      if(key==='167') {
        const alias=write('existing-presentation.png',{fixture:'different bytes for source-bound alias'});
        candidate.figures[0].presentationAsset={...alias,derivation:{kind:'single-source-image-rgba-to-png',alignment:'original-size',sourceAssetBindings:[{assetId:'asset',sha256:imageSha}]}};
        reviewImage=alias;
      }
      const current=write(`web-production/v1/candidates/79-bilibili-cn/${article}.new.json`,candidate);
      const old=write(`web-production/v1/candidates/79-bilibili-cn/${article}.old.json`,{...candidate,figures:[...candidate.figures,{...candidate.figures[0],figureId:'old-repaired',unknowns:[]}]});
      const parentAudit=write(`${article}-old-audit.json`,{modelReview:{issues:[{severity:'error',targetId:'old-repaired',description:'手牌首张5m误为6m'}]}});
      const output=key==='201'?{carriedIssue:{targetId:figureId,positionConfirmed:true,currentDisplayFaithful:true,authorArgumentFaithfulWithCurrentLimitation:true,requiresResolvedMeaningOrExactTileForAuthorArgument:false},issues:[{severity:'uncertain',targetId:figureId}]}:{repairChecks:[{figureId:'old-repaired',verdict:'faithful'}],unknownImpacts:positions.map(unknownText=>({figureId,unknownText})),completeTargetScopeCompared:true,issues:[{severity:'uncertain',targetId:figureId}]};
      const raw=write(`${article}-raw.json`,{success:true,binding:{canonical,productionSha256:current.sha256,sourceFileSha256:source.sha256},requestExecution:{images:[reviewImage]},output});
      write(`integration/coac249-${key}-target-impact-reviewed-20261028.json`,{key,canonical,candidate:current,source,parent:old,parentAudit,raw,modelReview:output,verification:key==='201'?{limitedEvidenceVerified:true}:{repairPassed:true,limitedUnknownOkay:false}});
      rows.push({chapterId:canonical,covered:key!=='167',approvedWebCorrespondence:{articleId:article},existingCandidate:{path:old.path,sha256:old.sha256,auditPath:parentAudit.path}});
      if(key!=='167')selections.push({candidatePath:current.path,candidateSha256:current.sha256,chapterIds:[canonical]});
    }
    write('integration/accepted-preview-current.json',{selectedWeb:selections});
    write('integration/current-web-candidate-selection.json',{candidates:[]});
    write('integration/current-candidate-selection.json',{pages:[]});
    write('integration/coac250-unified-chapter-register-20261027b.json',{rows});
    write('integration/coac244-remaining26-closure-register-20261028.json',{rows:[]});
    write('integration/coac250-uncovered-chapter-continuation-register-20261027b.json',{rows:[]});
    const queue=buildQueue(root);
    assert.deepEqual(queue.counts,{total:5,blocking:4,nonblocking:1});
    assert.deepEqual(queue.items.slice(0,4).map(x=>x.canonical),['79-cn-chapter-109-4','79-cn-chapter-109-4','79-cn-chapter-109-4','79-cn-chapter-167-4']);
    assert.equal(queue.items.some(x=>x.figureId==='old-repaired'),false);
    assert.equal(queue.items[0].position,'上方弃牌区从左至右第4张为万子，具体点数无法可靠辨认。');
    assert.equal(queue.items.at(-1).canonical,'79-cn-chapter-201-6');
    assert.equal(queue.items.every(x=>x.bbox===null),true);
    assert.equal(queue.items[0].evidence[0].reviewRawPath,'cv1729038-raw.json');
    const aliasFile=path.join(root,'existing-presentation.png'), aliasBytes=fs.readFileSync(aliasFile);
    fs.writeFileSync(aliasFile,'changed alias');
    assert.throws(()=>buildQueue(root),/图片别名SHA不匹配/);
    fs.writeFileSync(aliasFile,aliasBytes);
    // A receipt cannot attach a different raw response to the current candidate.
    const file=path.join(root,'cv1754620-raw.json');const raw=JSON.parse(fs.readFileSync(file,'utf8'));raw.binding.productionSha256='wrong';
    const binding=write('cv1754620-raw.json',raw), receiptFile=path.join(root,'integration/coac249-167-target-impact-reviewed-20261028.json');
    const receipt=JSON.parse(fs.readFileSync(receiptFile,'utf8'));receipt.raw=binding;fs.writeFileSync(receiptFile,JSON.stringify(receipt));
    assert.throws(()=>buildQueue(root),/精确审校绑定不匹配/);
  } finally {fs.rmSync(root,{recursive:true,force:true});}
});
