import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { mapMjaiDecisionPrefix } from './canonical.mjs';
import { createLibriichiRuleProjector, createLibriichiDecisionPrefixProjector, matchDecisionPrefixReferences, freezeDecisionStreamContext, freezeDecisionSnapshotInContext, projectKnownGameFactsV2 } from '@riichi-coach/reasoning';
import { mjaiFromTenhou } from './corpus.test.mjs';
const xml=await readFile(new URL('../../packages/tenhou-source/tests/fixtures/real-logs/bug1.xml',import.meta.url));
const rows=mjaiFromTenhou(xml), bytes=x=>Buffer.from(x.map(y=>JSON.stringify(y)).join('\n'));
const identity={implementation:'Equim-chan/Mortal/libriichi',revision:'0'.repeat(40),nativeArtifactSha256:'1'.repeat(64),wrapperSha256:'2'.repeat(64),normalizationVersion:'libriichi-actions/v2'};
const i=rows.findIndex(x=>x.type==='tsumo'&&x.actor===0), ref=`fixture/0/${i}/0`;
function make(r){const {stream,evidence}=mapMjaiDecisionPrefix(bytes(r),'fixture',0,undefined,ref),context=freezeDecisionStreamContext(stream),window={kind:'self_turn',actor:0,triggerEventRef:ref},snapshot=freezeDecisionSnapshotInContext(context,window),facts=projectKnownGameFactsV2({stream:context.stream,decisionWindow:window,cachedSnapshot:snapshot,streamContext:context}),decision={decisionEventRef:ref,snapshot,facts,actualAction:null,actualDiscard:null}; return {stream:context.stream,evidence,context,decision};}
test('explicit local prefix retains full-stream partial; rejects tampered proof',()=>{
 const r=structuredClone(rows);const later=r.findIndex((x,j)=>j>i&&x.type==='ryukyoku'); assert.ok(later>=0, 'fixture must contain a later draw settlement');
 delete r[later].reason; delete r[later].tenpais;const x=make(r);assert.equal(x.stream.completeness.scores,'partial');
 assert.throws(()=>createLibriichiRuleProjector(x.stream,identity,x.context)(x.decision),/rules_input_incomplete/);
 const request=createLibriichiDecisionPrefixProjector(x.stream,identity,x.evidence,x.context)(x.decision);
 assert.equal(request.decision.triggerEventRef,ref);assert.equal(x.stream.completeness.scores,'partial');
 for(const edit of [{sourceHash:'f'.repeat(64)},{canonicalPrefixHash:'a'.repeat(64)},{triggerOrdinal:x.evidence.triggerOrdinal+1},{initialScores:[0,0,0,0]}]) assert.throws(()=>createLibriichiDecisionPrefixProjector(x.stream,identity,{...x.evidence,...edit},x.context)(x.decision),/rules_input_incomplete/);
});
test('source round scores absent or defaulted are never accepted',()=>{
 const r=structuredClone(rows);delete r.find(x=>x.type==='start_kyoku').scores;
 assert.throws(()=>make(r));
 const x=make(rows);assert.throws(()=>createLibriichiDecisionPrefixProjector(x.stream,identity,{...x.evidence,initialScores:[0,0,0,0]},x.context)(x.decision),/rules_input_incomplete/);
});
test('opponent hidden draw and future mutations do not alter visible local events',()=>{
 const baseline=make(rows),r=structuredClone(rows);let changed=false;
 for(let j=1;j<i;j++)if(r[j].type==='tsumo'&&r[j].actor!==0){r[j].pai=r[j].pai==='1m'?'2m':'1m';changed=true;break}
 if(!changed){const s=r.find(x=>x.type==='start_kyoku');s.tehais[1][0]=s.tehais[1][0]==='1m'?'2m':'1m'}
 r.at(-1).scores[0] += 100;
 const mutated=make(r),a=createLibriichiDecisionPrefixProjector(baseline.stream,identity,baseline.evidence,baseline.context)(baseline.decision),b=createLibriichiDecisionPrefixProjector(mutated.stream,identity,mutated.evidence,mutated.context)(mutated.decision);
 assert.notEqual(baseline.evidence.sourceHash,mutated.evidence.sourceHash);assert.deepEqual(a.events,b.events);
});

test('source-neutral binding treats event references as opaque',()=>{
 const refs=['opaque-A','different:opaque B','🔒'];const positions=refs.map((eventRef,i)=>({ordinal:i+40,eventRef}));
 assert.equal(matchDecisionPrefixReferences(refs,positions,40,42),true);
 assert.equal(matchDecisionPrefixReferences(refs,[positions[1],positions[0],positions[2]],40,42),false);
 assert.equal(matchDecisionPrefixReferences(refs,positions,40,43),false);
});
