#!/usr/bin/env node
import { resolve, dirname } from 'node:path';
import { pathToFileURL } from 'node:url';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { CorpusStore } from '../scripts/replay-corpus/store.mjs';
import { SOURCES, discoverHuggingFace } from '../scripts/replay-corpus/sources.mjs';
import { importFile, localFiles, runJobs, lockDirectory } from '../scripts/replay-corpus/runner.mjs';
import { toCanonical } from '../scripts/replay-corpus/canonical.mjs';
import { validateCanonicalEventStream } from '@riichi-coach/reasoning';

const HELP = `公开牌谱语料工具（Node 24+；使用代理时 node --use-env-proxy）
  sources                              已核实来源与限制
  plan --sources nikke-majsoul,hhim-tenhou --out plan.json
  sync --state-dir DIR --manifest plan.json [--max-gb 10] [--max-storage-gb 10]
  import --state-dir DIR --input FILE_OR_DIR [--source NAME]
  status --state-dir DIR
  export --state-dir DIR --id CONTENT_ID --out FILE [--seat 0] [--format canonical|raw] [--hash RAW_HASH] [--rules FILE]
可选：--max-records N（每分片验证上限）；--live（数据集完成后天凤增量）；
--max-logs N、--max-index N、--old；--retry-failed；--tenhou-year YYYY。
默认同步预算为累计下载 10,000,000,000 字节，存储上限独立也为 10 GB，重启不重置。
所有数据保存在 state-dir，不写入用户复盘库；用 status 查看去重/失败/进度。
`;

function argumentsFor(argv) {
  const command = argv[0] ?? 'help', options = {};
  const flags = new Set(['live', 'old', 'retry-failed']);
  const values = new Set(['state-dir', 'sources', 'out', 'manifest', 'max-gb', 'max-storage-gb', 'input', 'source', 'id', 'seat', 'format', 'hash', 'rules', 'max-records', 'max-logs', 'max-index', 'tenhou-year']);
  for (let i = 1; i < argv.length; i++) {
    const key = argv[i].replace(/^--/, '');
    if (!argv[i].startsWith('--') || (!flags.has(key) && !values.has(key))) throw new Error(`unknown_option:${argv[i]}`);
    options[key] = flags.has(key) ? true : argv[++i];
    if (options[key] === undefined) throw new Error(`missing_value:${key}`);
  }
  return { command, options };
}
function number(value, fallback, integer = false) {
  const n = value === undefined ? fallback : Number(value);
  if (!Number.isFinite(n) || n < 0 || (integer && !Number.isInteger(n))) throw new Error('invalid_numeric_option');
  return n;
}
async function makePlan(options) {
  const requested = (options.sources ?? 'nikke-majsoul,hhim-tenhou,nikke-tenhou').split(',');
  const jobs = [];
  for (const id of requested) {
    const source = SOURCES.find(s => s.id === id);
    if (!source?.dataset) throw new Error(`source_not_bulk_downloadable:${id}`);
    jobs.push(...await discoverHuggingFace(source));
  }
  if (options['tenhou-year']) {
    const year = number(options['tenhou-year'], 0, true);
    if (year < 2009 || year >= new Date().getFullYear()) throw new Error('invalid_archive_year');
    jobs.push({ source: 'tenhou-year-index', priority: 1, kind: 'tenhou-index', name: `scraw${year}.zip`, url: `https://tenhou.net/sc/raw/scraw${year}.zip`, metadata: { year } });
  }
  return { schemaVersion: 'replay-corpus-plan/v1', createdAt: new Date().toISOString(), jobs };
}
function validatePlan(plan) {
  if (plan.schemaVersion !== 'replay-corpus-plan/v1' || !Array.isArray(plan.jobs) || plan.jobs.length > 10000) throw new Error('invalid_plan');
  for (const j of plan.jobs) {
    if (typeof j.source !== 'string' || typeof j.name !== 'string' || (!j.url && !j.path)) throw new Error('invalid_job');
    if (j.size !== undefined && (!Number.isSafeInteger(j.size) || j.size < 0)) throw new Error('invalid_job_size');
    if (j.sha256 !== undefined && !/^[a-f0-9]{64}$/.test(j.sha256)) throw new Error('invalid_checksum');
    if (j.priority !== undefined && ![0, 1, 2].includes(j.priority)) throw new Error('invalid_priority');
  }
  return plan;
}

export async function main(argv = process.argv.slice(2)) {
  const { command, options } = argumentsFor(argv);
  if (command === 'help' || command === '--help') { console.log(HELP); return; }
  if (command === 'sources') { console.log(JSON.stringify(SOURCES.map(({ match, ...s }) => ({ ...s, match: match?.source })), null, 2)); return; }
  if (command === 'plan') {
    const plan = await makePlan(options), text = JSON.stringify(plan, null, 2);
    if (options.out) await writeFile(options.out, text); else console.log(text);
    return;
  }
  if (!['sync', 'import', 'status', 'export'].includes(command)) throw new Error(`unknown_command:${command}`);
  if (!options['state-dir']) throw new Error('state_dir_required');
  const directory = resolve(options['state-dir']);
  const release = await lockDirectory(directory);
  let store;
  const abort = new AbortController(), interrupt = () => abort.abort(new Error('interrupted'));
  process.once('SIGINT', interrupt); process.once('SIGTERM', interrupt);
  try {
    store = new CorpusStore(directory, { maxBytes: Math.floor(number(options['max-storage-gb'], 10) * 1e9) });
    const progress = row => console.error(JSON.stringify(row));
    const runOptions = { maxDownloadBytes: Math.floor(number(options['max-gb'], 10) * 1e9), signal: abort.signal, onProgress: progress,
      ...(options['max-records'] ? { maxRecords: number(options['max-records'], 0, true) } : {}),
      live: !!options.live, old: !!options.old, maxLogs: number(options['max-logs'], 1000, true), maxIndex: number(options['max-index'], 10, true) };
    if (options['retry-failed']) {
      store.db.exec("UPDATE queue SET state='pending',error=NULL WHERE state='failed'; UPDATE jobs SET cursor=-1,state='pending',error=NULL WHERE state IN ('failed','done') AND key IN (SELECT job FROM failures); DELETE FROM failures;");
    }
    if (command === 'status') { console.log(JSON.stringify(store.summary(), null, 2)); return; }
    if (command === 'export') {
      if (!options.id || !options.out) throw new Error('export_id_and_out_required');
      const record = store.read(options.id, options.hash), seat = number(options.seat, 0, true);
      const rules = options.rules ? JSON.parse(await readFile(options.rules, 'utf8')) : undefined;
      const format = options.format ?? 'canonical';
      if (!['canonical', 'raw'].includes(format)) throw new Error('unsupported_export_format');
      let bytes = record.raw;
      if (format === 'canonical') {
        const stream = toCanonical(record, seat, rules), validation = validateCanonicalEventStream(stream);
        if (validation.status !== 'valid') throw new Error(`canonical_validation_failed:${validation.code}`);
        bytes = JSON.stringify(stream);
      }
      await mkdir(dirname(resolve(options.out)), { recursive: true });
      await writeFile(options.out, bytes, { flag: 'wx' });
      await writeFile(`${options.out}.metadata.json`, JSON.stringify({ id: record.game_id, rawHash: record.hash, observations: record.observations }, null, 2), { flag: 'wx' });
      console.log(JSON.stringify({ exported: options.out, id: record.game_id })); return;
    }
    let results;
    if (command === 'import') {
      if (!options.input) throw new Error('input_required');
      results = [];
      for await (const file of localFiles(resolve(options.input))) results.push(await importFile(file, store, { ...runOptions, source: options.source ?? 'local' }));
    } else {
      const plan = validatePlan(options.manifest ? JSON.parse(await readFile(options.manifest, 'utf8')) : await makePlan(options));
      await writeFile(joinState(directory, 'last-plan.json'), JSON.stringify(plan, null, 2));
      results = await runJobs(plan.jobs, store, runOptions);
    }
    const result = { ...store.summary(), results, timings: store.timings };
    await writeFile(joinState(directory, 'last-run.json'), JSON.stringify(result, null, 2));
    console.log(JSON.stringify(result, null, 2));
    if (results.some(r => r.error || r.rejected)) process.exitCode = 1;
  } finally { store?.close(); await release(); process.removeListener('SIGINT', interrupt); process.removeListener('SIGTERM', interrupt); }
}
const joinState = (dir, file) => resolve(dir, file);
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch(error => { console.error(error.message); process.exitCode = 1; });
}
