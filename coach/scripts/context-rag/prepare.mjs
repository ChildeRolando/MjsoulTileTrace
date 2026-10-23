import { DatabaseSync } from 'node:sqlite';
import { zstdDecompressSync } from 'node:zlib';
import { readdir, appendFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createManagedMortalRuntimeFromAssets } from '@riichi-coach/mortal-runtime';
import { questionLabNativeReceipt } from '@riichi-coach/question-lab';
import { replayCanonicalStream, createLibriichiRuleProjector, buildScenePatternFacts, JsonlFactEngineClient, ManagedFactEngineTransport } from '@riichi-coach/reasoning';
import { createArenaBlindRuleRequest, screenArenaDecisions, createArenaBlindObservation, createArenaToolBinding, ArenaRunAliasVault } from '@riichi-coach/desktop/blind-discard-arena';
import { mapMjaiRecord } from '../replay-corpus/canonical.mjs';
import { tenhouRules } from '../scene-study/prepare.mjs';
import { hash, ordered, read, save, exists } from '../scene-study/common.mjs';

const root = resolve(fileURLToPath(new URL('../..', import.meta.url)));
export async function prepare({ out, database, previous }) {
  if (await exists(join(out, 'dataset.json'))) return read(join(out, 'dataset.json'));
  const old = await read(join(previous, 'dataset.json'));
  const excluded = new Set(old.cases.map(c => c.gameId));
  // Exclude even old preparation pools that were not selected, not merely the reviewed 60.
  for (const file of await readdir(join(previous, 'prepared-games-v2'))) {
    for (const c of await read(join(previous, 'prepared-games-v2', file))) excluded.add(c.gameId);
  }
  const db = new DatabaseSync(database, { readOnly: true });
  const records = ordered(db.prepare("SELECT v.game_id,v.hash,o.locator FROM variants v JOIN observations o ON o.hash=v.hash WHERE o.source='nikke-tenhou' AND v.format='mjai' GROUP BY v.game_id ORDER BY v.game_id").all().filter(r => !excluded.has(r.game_id)), r => r.game_id, 'context-rag-fresh-v1');
  const assets = process.env.RIICHI_LOCAL_MORTAL_ROOT ?? join(process.env.LOCALAPPDATA, 'RiichiCoach/local-mortal-spike');
  const runtime = await createManagedMortalRuntimeFromAssets({ pythonExecutable: join(assets, 'python/Scripts/python.exe'), packageRoot: join(root, 'packages/mortal-runtime'), artifactRoot: assets, platformManifest: 'mortal-582500.windows-x64.json', nativeReceiptPath: await questionLabNativeReceipt(), inferenceTimeoutMs: 60000 });
  const engine = new JsonlFactEngineClient(new ManagedFactEngineTransport(join(root, 'resources')));
  const cases = [];
  try {
    for (const record of records.slice(0, 80)) {
      if (cases.length === 10) break;
      try {
        const cache = join(out, 'prepared', hash(record.game_id) + '.json');
        let selectedCase;
        if (await exists(cache)) selectedCase = await read(cache);
        else {
          const rules = tenhouRules(record.locator), raw = zstdDecompressSync(db.prepare('SELECT data FROM variants WHERE hash=?').get(record.hash).data);
          const selfActor = parseInt(hash('context-rag-v1' + record.game_id).slice(0, 2), 16) % 4;
          const stream = mapMjaiRecord(raw, record.game_id, selfActor, rules), decisions = replayCanonicalStream(stream), project = createLibriichiRuleProjector(stream, runtime.ruleIdentity);
          for (const { d, i } of ordered(decisions.map((d, i) => ({ d, i })), x => record.game_id + ':' + x.i, 'context-rag-decision-v1')) {
            if (!['self_turn', 'post_call_discard'].includes(d.snapshot.privateState.decisionWindow.kind)) continue;
            const ruleRequest = createArenaBlindRuleRequest(project(d)), ruleResponse = await runtime.queryRules(ruleRequest);
            const selected = screenArenaDecisions([{ canonicalDecisionOrder: i, decision: { decisionEventRef: d.decisionEventRef, snapshot: d.snapshot, facts: d.facts }, ruleRequest, ruleResponse }]).selected[0];
            if (!selected) continue;
            const aliases = new ArenaRunAliasVault(), observation = createArenaBlindObservation({ selected, aliases });
            const facts = await buildScenePatternFacts({ caseRef: observation.caseRef, snapshot: selected.snapshot, facts: selected.facts, candidates: selected.candidates.map(c => ({ actionRef: c.actionRef, action: c.action, origins: ['model'] })), engine, reference: r => aliases.reference(r) });
            selectedCase = { id: hash(record.game_id + ':' + i).slice(0, 24), gameId: record.game_id, sourceHash: record.hash, sourceLocator: record.locator, roundOrdinal: d.snapshot.publicState.roundOrdinal, selfActor, canonicalDecisionOrder: i, observation, facts, binding: createArenaToolBinding({ caseRef: observation.caseRef, selected }) };
            await save(cache, selectedCase);
            break;
          }
        }
        if (!selectedCase) throw new Error('no_eligible_discard');
        cases.push({ ...selectedCase, split: cases.length < 2 ? 'pilot' : 'evaluation' });
        console.log(JSON.stringify({ prepared: cases.length, gameId: record.game_id }));
      } catch (e) {
        await save(join(out, 'last-exclusion.json'), { gameId: record.game_id, error: String(e.message) });
        await appendFile(join(out, 'exclusions.jsonl'), JSON.stringify({ gameId: record.game_id, error: String(e.message) }) + '\n');
      }
    }
    if (cases.length !== 10) throw new Error(`context_rag_insufficient_fresh_games:${cases.length}`);
    const dataset = { version: 'context-rag-dataset/v1', previousDatasetHash: hash(old), excludedGames: [...excluded], sampling: 'seeded random visible discard, one per fresh game; 2 pilot + 8 evaluation; no outcome/label selection', rulesIdentity: runtime.ruleIdentity, factIdentity: await engine.identity(), cases };
    await save(join(out, 'dataset.json'), dataset);
    return dataset;
  } finally { db.close(); await Promise.allSettled([runtime.close(), engine.close()]); }
}
