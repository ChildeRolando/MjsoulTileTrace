// Offline composition only: production desktop never imports question-lab.
import { mkdir, readFile, readdir, writeFile, rename } from 'node:fs/promises';
import { join } from 'node:path';
import { z } from 'zod';
import { QuestionLabConfigSchema } from '@riichi-coach/contracts';
import { bindLibriichiRuleResult, createLibriichiRuleProjector } from '@riichi-coach/reasoning';
import { Archive, LabBatch, digest, readSamples, pendingDecision, pairObservations } from '@riichi-coach/question-lab';
export { questionLabNativeReceipt, pendingDecision } from '@riichi-coach/question-lab';
import { createArenaBlindRuleRequest, screenArenaDecisions, arenaScenarioType, ArenaRunAliasVault, createArenaBlindObservation } from '@riichi-coach/desktop/blind-discard-arena';
import { ArenaCaseCatalogSchema } from '@riichi-coach/desktop/blind-discard-arena-archive';

export const GENERATED_DATASET = 'blind-discard-generated-v1';
export const BankId = z.string().uuid();
export const GenerationOptions = z.object({
  preset: z.enum(['flat', 'spatial', 'conflict']).default('flat'),
  count: z.number().int().min(1).max(128).default(20),
  seed: z.number().int().min(0).max(0xffffffff).default(20261022),
  timeLimitSeconds: z.number().int().min(10).max(1800).default(300),
}).strict();
const names = { flat: '随机平面何切', spatial: '立直与副露背景', conflict: '牌效率与保留宝牌冲突' };
export function bankDirectory(root, id) { return join(root, 'question-banks', BankId.parse(id)); }
export function generationConfig(raw) {
  const options = GenerationOptions.parse(raw);
  return QuestionLabConfigSchema.parse({ schemaVersion: 'question-lab-config/v1', name: names[options.preset], seed: options.seed,
    scene: options.preset === 'spatial' ? { selfActor: { fixed: 0 }, turn: { range: [6, 10] }, players: [
      { actor: 1, riichi: { fixed: true } }, { actor: 2, melds: { fixed: [{ kind: 'pon', tiles: ['P', 'P', 'P'], target: 3 }] } },
    ] } : { turn: { range: [3, 10] }, players: [0, 1, 2, 3].map(actor => ({ actor, riichi: { fixed: false }, melds: { fixed: [] } })) },
    budget: { count: options.count, maxAttempts: Math.min(40000, options.count * 200), timeLimitSeconds: options.timeLimitSeconds,
      concurrency: 2, refinementRounds: 0 },
  });
}
export function sampleRuleInput(sample, canonicalDecisionOrder, ruleRequest, ruleResponse) {
  const decision = pendingDecision(sample.stream);
  return { canonicalDecisionOrder, decision: { decisionEventRef: decision.decisionEventRef, snapshot: decision.snapshot, facts: decision.facts },
    ruleRequest: createArenaBlindRuleRequest(ruleRequest), ruleResponse };
}
export function admission(sample, preset) {
  const decision = pendingDecision(sample.stream);
  const bound = bindLibriichiRuleResult({ request: sample.ruleRequest, response: sample.ruleResult, decision });
  if (bound.actions.length < 2) return 'fewer_than_two_candidates';
  if (bound.actions.some(c => c.action.kind !== 'discard')) return 'contains_non_discard_action';
  const scenario = arenaScenarioType(decision.snapshot.publicState);
  if (scenario !== (preset === 'spatial' ? 'spatial' : 'flat')) return 'different_experiment_type';
  if (preset === 'conflict' && pairObservations(sample).reason !== 'strict_conflict') return 'not_strict_conflict';
  return null;
}
export async function prepareBankRuleInputs(samples, runtime) {
  const inputs = [];
  for (let i = 0; i < samples.length; i++) {
    const request = createArenaBlindRuleRequest(createLibriichiRuleProjector(samples[i].stream, runtime.ruleIdentity)(pendingDecision(samples[i].stream)));
    const input = sampleRuleInput(samples[i], i, request, await runtime.queryRules(request));
    const bound = bindLibriichiRuleResult({ request: input.ruleRequest, response: input.ruleResponse, decision: input.decision });
    if (digest(bound.actions.map(a => [a.actionRef, a.action])) !== digest(samples[i].candidates.map(a => [a.actionRef, a.action])))
      throw new Error('arena_generated_candidate_mismatch');
    inputs.push(input);
  }
  const screened = screenArenaDecisions(inputs, { maxIncluded: 128 });
  if (screened.selected.length !== samples.length) throw new Error('arena_generated_rules_mismatch');
  return inputs;
}
async function atomicJson(path, value) {
  const temporary = `${path}.${process.pid}.tmp`;
  await writeFile(temporary, JSON.stringify(value, null, 2), { mode: 0o600 });
  await rename(temporary, path);
}
export async function loadGeneratedBank(root, id) {
  const directory = bankDirectory(root, id);
  const bank = JSON.parse(await readFile(join(directory, 'bank.json'), 'utf8'));
  if (bank.bankId !== id || bank.schemaVersion !== 'arena-question-bank/v1') throw new Error('arena_bank_identity_mismatch');
  const options = GenerationOptions.parse(bank.options);
  const archive = Archive.readOnly(join(directory, 'lab'));
  const manifest = await archive.read('manifest.json');
  if (digest(manifest) !== bank.labManifestSha256 || digest(manifest.identity.config) !== digest(generationConfig(options))) throw new Error('arena_bank_manifest_mismatch');
  const samples = await readSamples(archive);
  if (digest(samples.map(s => s.sampleId)) !== digest(bank.sampleIds) || samples.some(s => admission(s, options.preset)))
    throw new Error('arena_bank_samples_mismatch');
  return { bank, samples, bankSha256: digest(bank) };
}
export async function generateBank(root, id, raw, codeSha) {
  const directory = bankDirectory(root, id), options = GenerationOptions.parse(raw), config = generationConfig(options);
  await mkdir(directory, { recursive: true });
  const request = { schemaVersion: 'arena-generation-request/v1', bankId: id, options, codeSha };
  try { await writeFile(join(directory, 'request.json'), JSON.stringify(request), { flag: 'wx', mode: 0o600 }); }
  catch (error) {
    if (error.code !== 'EEXIST') throw error;
    const previous = JSON.parse(await readFile(join(directory, 'request.json'), 'utf8'));
    if (digest(previous) !== digest(request)) throw new Error('arena_generation_resume_identity_mismatch');
  }
  // A published bank is immutable. Repeating a completed request is a read, never inference.
  let published = false;
  try { await readFile(join(directory, 'catalog.json')); published = true; }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  if (published) { const catalog = await readGeneratedCatalog(root, id); await loadGeneratedBank(root, id); return catalog; }
  const batch = await LabBatch.open(config, join(directory, 'lab'));
  let samples, summary, manifest, ruleInputs;
  try {
    samples = await batch.generate(0, sample => admission(sample, options.preset) === null);
    summary = await batch.archive.read('generation-summary.json');
    manifest = await batch.archive.read('manifest.json');
    ruleInputs = await prepareBankRuleInputs(samples, batch.workers[0].mortal);
  } finally { await batch.close(); }
  const sourceGroups = new Set(samples.map(s => s.groupId)).size;
  const aliases = new ArenaRunAliasVault();
  const screening = screenArenaDecisions(ruleInputs, { maxIncluded: 128 });
  const cases = screening.selected.map(selected => ({ canonicalDecisionOrder: selected.canonicalDecisionOrder,
    observation: createArenaBlindObservation({ selected, aliases, tools: { description: 'Label-free question preview.', supportedCapabilities: ['analyze_candidates', 'search_knowledge'] } }) }));
  const bank = { schemaVersion: 'arena-question-bank/v1', bankId: id, options, codeSha, createdAt: new Date().toISOString(),
    labManifestSha256: digest(manifest), sampleIds: samples.map(s => s.sampleId), sourceGroups, previewSha256: digest(cases) };
  const bankHash = digest(bank);
  const catalog = ArenaCaseCatalogSchema.parse({ schemaVersion: 'blind-discard-arena-catalog/v1', datasetId: GENERATED_DATASET,
    codeSha, createdAt: bank.createdAt, caseSetDigest: bankHash, sourceRecordHash: `sha256:${bankHash}`, fixtureSha256: bankHash,
    developmentGames: 0, acceptanceGames: 0, inputCaseCount: samples.length, excluded: screening.excluded,
    generated: { bankId: id, name: config.name, seed: config.seed, requested: options.count, sourceGroups,
      attempts: summary.attempts, failures: summary.failures, status: summary.status },
    cases,
  });
  await atomicJson(join(directory, 'bank.json'), bank);
  await atomicJson(join(directory, 'catalog.json'), catalog);
  return catalog;
}
export async function readGeneratedCatalog(root, id) {
  const bank = ArenaCaseCatalogSchema.parse(JSON.parse(await readFile(join(bankDirectory(root, id), 'catalog.json'), 'utf8')));
  const source = JSON.parse(await readFile(join(bankDirectory(root, id), 'bank.json'), 'utf8'));
  if (bank.generated?.bankId !== id || source.bankId !== id || bank.caseSetDigest !== digest(source) || digest(bank.cases) !== source.previewSha256
      || bank.fixtureSha256 !== bank.caseSetDigest || bank.sourceRecordHash !== `sha256:${bank.caseSetDigest}`
      || bank.codeSha !== source.codeSha || bank.createdAt !== source.createdAt
      || bank.generated.seed !== source.options.seed || bank.generated.requested !== source.options.count
      || bank.generated.sourceGroups !== source.sourceGroups || bank.generated.name !== names[source.options.preset]
      || bank.inputCaseCount !== source.sampleIds.length || bank.cases.length !== source.sampleIds.length)
    throw new Error('arena_bank_identity_mismatch');
  return bank;
}
export async function listGeneratedBanks(root) {
  let entries;
  try { entries = await readdir(join(root, 'question-banks'), { withFileTypes: true }); }
  catch (error) { if (error.code === 'ENOENT') return []; throw error; }
  const banks = [];
  for (const entry of entries) {
    if (!entry.isDirectory() || !BankId.safeParse(entry.name).success) continue;
    try {
      const request = JSON.parse(await readFile(join(bankDirectory(root, entry.name), 'request.json'), 'utf8'));
      const options = GenerationOptions.parse(request.options);
      let catalog = null;
      try { catalog = await readGeneratedCatalog(root, entry.name); } catch { /* interrupted or unreadable banks cannot be selected for evaluation */ }
      banks.push({ bankId: entry.name, name: names[options.preset], options, ready: catalog !== null,
        availableCaseCount: catalog?.cases.length ?? 0, createdAt: catalog?.createdAt ?? null, generated: catalog?.generated ?? null });
    } catch { /* malformed request is not an owned bank */ }
  }
  return banks.sort((a, b) => (b.createdAt ?? '').localeCompare(a.createdAt ?? ''));
}
