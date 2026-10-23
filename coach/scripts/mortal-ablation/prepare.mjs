import { DatabaseSync } from 'node:sqlite';
import { zstdDecompressSync } from 'node:zlib';
import { readdir, appendFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createManagedMortalRuntimeFromAssets, loadManagedMortalManifest } from '@riichi-coach/mortal-runtime';
import { questionLabNativeReceipt } from '@riichi-coach/question-lab';
import { replayCanonicalStream, createLibriichiRuleProjector, buildScenePatternFacts, matchScenePatterns, bindLocalMortalRuleScores, JsonlFactEngineClient, ManagedFactEngineTransport } from '@riichi-coach/reasoning';
import { createArenaBlindRuleRequest, screenArenaDecisions, createArenaBlindObservation, createArenaToolBinding, createArenaReferenceLabel, ArenaRunAliasVault } from '@riichi-coach/desktop/blind-discard-arena';
import { projectArenaLocalMortalRuleScoring } from '@riichi-coach/desktop/blind-discard-arena-scorer';
import { mapMjaiRecord } from '../replay-corpus/canonical.mjs';
import { tenhouRules } from '../scene-study/prepare.mjs';
import { hash, ordered, read, save, exists } from '../scene-study/common.mjs';

const root = resolve(fileURLToPath(new URL('../..', import.meta.url)));
const platformManifest = 'mortal-582500.windows-x64.json';
async function openRuntime() {
  const assets = process.env.RIICHI_LOCAL_MORTAL_ROOT ?? join(process.env.LOCALAPPDATA, 'RiichiCoach/local-mortal-spike');
  return createManagedMortalRuntimeFromAssets({ pythonExecutable: join(assets, 'python/Scripts/python.exe'), packageRoot: join(root, 'packages/mortal-runtime'), artifactRoot: assets, platformManifest, nativeReceiptPath: await questionLabNativeReceipt(), inferenceTimeoutMs: 60000 });
}
export const hits = c => matchScenePatterns(c.facts).results.filter(p => p.status === 'matched').map(p => p.patternId);
export function chooseChallenge(pool, covered) {
  // All ranking inputs are visible deterministic facts; no score, outcome or actual action.
  const rank = c => hits(c).filter(id => !covered.has(id)).length * 100 + hits(c).length;
  return [...pool].sort((a, b) => rank(b) - rank(a) || a.id.localeCompare(b.id))[0];
}
export async function prepare({ out, database, previous, priorContext }) {
  if (await exists(join(out, 'dataset.json'))) return read(join(out, 'dataset.json'));
  const old = await read(join(previous, 'dataset.json')), prior = await read(join(priorContext, 'dataset.json'));
  const excluded = new Set([...old.cases, ...prior.cases].map(c => c.gameId));
  const excludedHashes = new Set([...old.cases, ...prior.cases].map(c => c.sourceHash));
  for (const file of await readdir(join(previous, 'prepared-games-v2'))) for (const c of await read(join(previous, 'prepared-games-v2', file))) { excluded.add(c.gameId); excludedHashes.add(c.sourceHash); }
  const db = new DatabaseSync(database, { readOnly: true });
  const records = ordered(db.prepare("SELECT v.game_id,v.hash,o.locator FROM variants v JOIN observations o ON o.hash=v.hash WHERE o.source='nikke-tenhou' AND v.format='mjai' GROUP BY v.game_id ORDER BY v.game_id").all().filter(r => !excluded.has(r.game_id) && !excludedHashes.has(r.hash)), r => r.game_id, 'mortal-ablation-games-v1');
  const runtime = await openRuntime(), engine = new JsonlFactEngineClient(new ManagedFactEngineTransport(join(root, 'resources'))), cases = [], covered = new Set();
  try {
    for (const record of records.slice(0, 400)) {
      if (cases.length === 21) break;
      if (cases.some(c => c.sourceHash === record.hash)) continue;
      const stratum = cases.length === 0 ? 'pilot' : cases.length <= 12 ? 'random' : 'challenge';
      try {
        const cache = join(out, 'prepared', hash(record.game_id) + '.json');
        let pool;
        if (await exists(cache)) pool = await read(cache);
        else {
          const raw = zstdDecompressSync(db.prepare('SELECT data FROM variants WHERE hash=?').get(record.hash).data);
          const selfActor = parseInt(hash('mortal-ablation-seat-v1' + record.game_id).slice(0, 2), 16) % 4;
          const stream = mapMjaiRecord(raw, record.game_id, selfActor, tenhouRules(record.locator)), decisions = replayCanonicalStream(stream), project = createLibriichiRuleProjector(stream, runtime.ruleIdentity);
          pool = [];
          for (const { d, i } of ordered(decisions.map((d, i) => ({ d, i })), x => record.game_id + ':' + x.i, 'mortal-ablation-decision-v1')) {
            if (!['self_turn', 'post_call_discard'].includes(d.snapshot.privateState.decisionWindow.kind)) continue;
            const ruleRequest = createArenaBlindRuleRequest(project(d)), ruleResponse = await runtime.queryRules(ruleRequest);
            const selected = screenArenaDecisions([{ canonicalDecisionOrder: i, decision: { decisionEventRef: d.decisionEventRef, snapshot: d.snapshot, facts: d.facts }, ruleRequest, ruleResponse }]).selected[0];
            if (!selected) continue;
            const aliases = new ArenaRunAliasVault(), observation = createArenaBlindObservation({ selected, aliases });
            const facts = await buildScenePatternFacts({ caseRef: observation.caseRef, snapshot: selected.snapshot, facts: selected.facts, candidates: selected.candidates.map(c => ({ actionRef: c.actionRef, action: c.action, origins: ['model'] })), engine, reference: r => aliases.reference(r) });
            pool.push({ id: hash(record.game_id + ':' + i).slice(0, 24), gameId: record.game_id, sourceHash: record.hash, sourceLocator: record.locator, roundOrdinal: d.snapshot.publicState.roundOrdinal, selfActor, canonicalDecisionOrder: i, observation, facts, binding: createArenaToolBinding({ caseRef: observation.caseRef, selected }) });
            if (pool.length === (stratum === 'challenge' ? 12 : 1)) break;
          }
          await save(cache, pool);
        }
        if (!pool.length) throw new Error('no_eligible_discard');
        const c = stratum === 'challenge' ? chooseChallenge(pool, covered) : pool[0];
        cases.push({ ...c, split: stratum === 'pilot' ? 'pilot' : 'evaluation', stratum });
        if (stratum !== 'pilot') for (const id of hits(c)) covered.add(id);
        console.log(JSON.stringify({ prepared: cases.length, stratum, patterns: hits(c) }));
      } catch (e) { await appendFile(join(out, 'exclusions.jsonl'), JSON.stringify({ gameId: record.game_id, error: String(e.message) }) + '\n'); }
    }
    if (cases.length !== 21) throw new Error(`mortal_ablation_insufficient_games:${cases.length}`);
    const dataset = { version: 'mortal-ablation-dataset/v1', sampling: '1 pilot + 12 random + 8 coverage challenges; distinct fresh games and hashes; seeded seat/decision order; challenges maximize new matched patterns among first 12 eligible decisions, then total matches, then id; no outcome or Mortal selection', previousDatasetHash: hash(old), previousContextHash: hash(prior), excludedGames: [...excluded], excludedHashes: [...excludedHashes], rulesIdentity: runtime.ruleIdentity, factIdentity: await engine.identity(), cases };
    await save(join(out, 'dataset.json'), dataset);
    return dataset;
  } finally { db.close(); await Promise.allSettled([runtime.close(), engine.close()]); }
}

// A separate command, after the public dataset is frozen. Nothing here is imported by the model runner.
export async function label({ out, database }) {
  const dataset = await read(join(out, 'dataset.json')), freeze = await read(join(out, 'freeze.json'));
  if (hash(dataset) !== freeze.datasetHash) throw new Error('mortal_ablation_dataset_changed');
  const db = new DatabaseSync(database, { readOnly: true }), runtime = await openRuntime();
  const runtimeManifest = await loadManagedMortalManifest(join(root, 'packages/mortal-runtime/manifests', platformManifest));
  const rows = [];
  try {
    for (const c of dataset.cases) {
      const path = join(out, 'private-labels', c.id + '.json');
      if (await exists(path)) { const saved = await read(path); if (saved.datasetHash !== hash(dataset)) throw new Error('label_dataset_changed'); rows.push(saved); continue; }
      let row;
      try {
        const raw = zstdDecompressSync(db.prepare('SELECT data FROM variants WHERE hash=?').get(c.sourceHash).data);
        const stream = mapMjaiRecord(raw, c.gameId, c.selfActor, tenhouRules(c.sourceLocator)), decision = replayCanonicalStream(stream)[c.canonicalDecisionOrder];
        const ruleRequest = createArenaBlindRuleRequest(createLibriichiRuleProjector(stream, runtime.ruleIdentity)(decision)), ruleResult = await runtime.queryRules(ruleRequest);
        const selected = screenArenaDecisions([{ canonicalDecisionOrder: c.canonicalDecisionOrder, decision: { decisionEventRef: decision.decisionEventRef, snapshot: decision.snapshot, facts: decision.facts }, ruleRequest, ruleResponse: ruleResult }]).selected[0];
        if (!selected) throw new Error('label_candidate_mismatch');
        // Alias UUIDs are intentionally random; bind the full raw snapshot and complete
        // candidate set using the already frozen case alias, never regenerate that alias.
        if (hash(createArenaToolBinding({ caseRef: c.observation.caseRef, selected })) !== hash(c.binding)) throw new Error('label_candidate_mismatch');
        const request = projectArenaLocalMortalRuleScoring({ decision, identity: runtime.identity, ruleRequest, ruleResult });
        const response = await runtime.scoreRules(request), boundScores = bindLocalMortalRuleScores({ request, response, decision });
        row = { caseId: c.id, datasetHash: hash(dataset), reference: { status: 'available', label: createArenaReferenceLabel({ caseRef: c.observation.caseRef, boundScores, runtimeManifest }) }, boundScores };
      } catch (e) { row = { caseId: c.id, datasetHash: hash(dataset), reference: { status: 'unavailable', reason: 'mortal_error' }, error: String(e.message) }; }
      await save(path, row); rows.push(row); console.log(JSON.stringify({ label: c.id, status: row.reference.status, error: row.error }));
    }
    await save(join(out, 'labels-receipt.json'), { datasetHash: hash(dataset), runtimeManifest, rows: rows.map(r => ({ caseId: r.caseId, hash: hash(r), status: r.reference.status })) });
  } finally { db.close(); await runtime.close(); }
}
