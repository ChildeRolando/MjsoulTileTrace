// Read-only parity/performance check; no model generation or corpus mutation.
import { DatabaseSync } from 'node:sqlite';
import { zstdDecompressSync } from 'node:zlib';
import { performance } from 'node:perf_hooks';
import { join } from 'node:path';
import { replayCanonicalStream,createLibriichiRuleProjector,freezeDecisionStreamContext } from '@riichi-coach/reasoning';
import { mapMjaiRecord } from '../replay-corpus/canonical.mjs';
import { tenhouRules } from '../scene-study/prepare.mjs';
import { oneDecision,selfWindows,loadPreparationState } from './ceiling-prepare.mjs';
import { DEFAULT_OUT,DEFAULT_DATABASE,hash,read,save,exists } from './ceiling-protocol.mjs';
const out=process.argv[2]??DEFAULT_OUT;
const d=await exists(join(out,'dataset.json'))?await read(join(out,'dataset.json')):await loadPreparationState(out);
const samples=[d.cases[0],[...d.cases].sort((a,b)=>b.canonicalDecisionOrder-a.canonicalDecisionOrder)[0]];
const db=new DatabaseSync(d.database??DEFAULT_DATABASE,{readOnly:true}),results=[];
try{
  for(const c of samples){
    const raw=zstdDecompressSync(db.prepare('SELECT data FROM variants WHERE hash=?').get(c.sourceHash).data),stream=mapMjaiRecord(raw,c.gameId,c.selfActor,tenhouRules(c.sourceLocator));
    for(let repeat=0;repeat<3;repeat++){
      global.gc?.();let started=performance.now(),all=replayCanonicalStream(stream);
      const old=all[c.canonicalDecisionOrder],oldRequest=createLibriichiRuleProjector(stream,c.binding.ruleIdentity)(old),expected=hash({snapshot:old.snapshot,facts:old.facts,request:oldRequest}),fullMs=performance.now()-started;
      all=null;global.gc?.();started=performance.now();
      const context=freezeDecisionStreamContext(stream),decision=oneDecision(context,selfWindows(stream)[c.canonicalDecisionOrder]),request=createLibriichiRuleProjector(context.stream,c.binding.ruleIdentity,context)(decision);
      results.push({caseId:c.id,events:stream.events.length,repeat,fullMs:Math.round(fullMs),oneMs:Math.round(performance.now()-started),equal:expected===hash({snapshot:decision.snapshot,facts:decision.facts,request})});
    }
  }
}finally{db.close();}
const receipt={version:'ceiling-sampling-parity/v1',nodeVersion:process.version,results};
await save(join(out,'sampling-parity-latest.json'),receipt);console.log(JSON.stringify(receipt));if(results.some(r=>!r.equal))process.exitCode=1;
