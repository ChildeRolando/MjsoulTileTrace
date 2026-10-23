import { describe,it,expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { LOCAL_MORTAL_SCORING_PROTOCOL_VERSION } from '@riichi-coach/contracts';
import { makeArenaMcpCase } from './fixtures/arena-mcp-case.js';
import { aggregate,contrast,exactDiscordance,holm,measure,wilson } from '../../../scripts/mortal-ablation/report.mjs';
describe('Mortal ablation metrics',()=>{
  it('has non-degenerate uncertainty at 0 and 100 percent and null at no samples',()=>{
    expect(wilson(0,20).high).toBeCloseTo(.161125,5);
    expect(wilson(20,20).low).toBeCloseTo(.838875,5);
    expect(wilson(0,0).estimate).toBeNull();
  });
  it('calculates exact discordance and monotone multiplicity adjustment',()=>{
    expect(exactDiscordance(5,0)).toBe(.0625);
    expect(exactDiscordance(0,5)).toBe(.0625);
    expect(exactDiscordance(2,2)).toBe(1);
    expect(exactDiscordance(0,0)).toBe(1);
    expect(holm([.04,.01,.03])).toEqual([.06,.03,.06]);
  });
  it('pairs by game and retains failures while excluding unknown costs from ratios',()=>{
    const row=(match,usageStatus='reported',n=10)=>({match,usageStatus,tokens:{totalTokens:n}});
    const pairs=[{gameId:'g1',A:row(0),B:row(1,'reported',20)},{gameId:'g2',A:row(1),B:row(0,'unknown')}];
    const c=contrast(pairs,'B','A');
    expect(c.wins).toBe(1);expect(c.losses).toBe(1);expect(c.difference.estimate).toBe(0);expect(c.costPairs).toBe(1);expect(c.tokenRatio.estimate).toBe(2);
  });
  it('scores top-1 using the existing canonical scorer and keeps partial cost unknown',()=>{
    const {observation,authorizedCase}=makeArenaMcpCase(),c={id:'c',gameId:'g',stratum:'random',observation,binding:authorizedCase.binding};
    const manifest=JSON.parse(readFileSync(new URL('../../mortal-runtime/manifests/mortal-582500.windows-x64.json',import.meta.url),'utf8'));
    const actionRef=observation.candidates[0].actionRef;
    const label={reference:{status:'available',label:{schemaVersion:'blind-discard-arena-reference/v1',caseRef:observation.caseRef,actionRef,runtimeIdentity:{...manifest.identity,nativeArtifactSha256:'a'.repeat(64)},runtimeConfigSha256:'b'.repeat(64),ruleIdentity:c.binding.ruleIdentity,scoringProtocolVersion:LOCAL_MORTAL_SCORING_PROTOCOL_VERSION}}};
    const submission={caseRef:observation.caseRef,actionRef,rationale:'visible',evidenceRefs:[],sourceRefs:[],mainAlternative:null,uncertainty:''};
    const run={arm:'A',status:'completed',result:{attempt:{status:'submitted',submission},elapsedMs:10,providerUsage:{status:'reported',tokens:{totalTokens:100,inputTokens:80,outputTokens:20}}},sourceMap:{}};
    const good=measure(c,run,label);expect(good.match).toBe(1);
    const bad=measure(c,{...run,status:'failed',result:{...run.result,attempt:{status:'timeout'},providerUsage:{status:'partial',reportedPartial:{totalTokens:25}}}},label);
    const a=aggregate([good,bad]);expect(a.primary.estimate).toBe(.5);expect(a.conditional.estimate).toBe(1);expect(a.unknownUsageRuns).toBe(1);expect(a.knownTotalTokens).toBe(125);expect(a.failures).toBe(1);
  });
});
