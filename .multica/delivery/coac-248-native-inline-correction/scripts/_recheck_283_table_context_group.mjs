// Bounded re-review of the 283-1 table-position findings for one inherited complete-unit
// group, with the candidate figure tableContext projected (projectionVersion 3) exactly as
// the candidate carries it. One model call per group, no production, no whole-group re-audit.
//
//   node _recheck_283_table_context_group.mjs 003
//
// Idempotent: an existing per-group record is reused instead of a second call.
import {readFile, writeFile, appendFile, mkdir} from 'node:fs/promises';
import {createHash, randomUUID} from 'node:crypto';
import {join, dirname} from 'node:path';
import {pathToFileURL} from 'node:url';

const ROOT = 'E:/AgentData/Coach/knowledge/processing';
const RUNTIME_REL = 'audit/runtimes/web-group-revision-20261027-frozen-4bd6e4fc';
const RUNTIME = join(ROOT, RUNTIME_REL);
const CAND_REL = 'web-production/v1/candidates/modern-yabejp-ja/chapter06-exercise003.rev2.json';
const CAND_SHA = '849267b84c85544fc8378ec8e462be1a2101766c40726dbd77ce7558c67c50f3';
const SRC_REL = 'web-sources/v1/modern-yabejp-ja/articles/chapter06-exercise003/source.v3.json';
const SRC_SHA = '8e7eff57a85e84fb963209117689b07fec5efd9b5d7ee81c12f1fd3a44b497de';
const RECEIPT_REL = 'audit/web/articles/modern-yabejp-ja/chapter06-exercise003.849267b84c85544fc8378ec8e462be1a2101766c40726dbd77ce7558c67c50f3.json';
const RECEIPT_SHA = '21d909b832c28e62a76f453863ed24d8fc8738adbb54b36bfd8117b9395d5aea';
const PARENT_CAND_REL = 'web-production/v1/candidates/modern-yabejp-ja/chapter06-exercise003.rev1.json';
const PARENT_CAND_SHA = 'dea1ba2453139b1ce13725be3bb195e85133a80c3a744db0166a247ca79f5899';
const PARENT_RECEIPT_REL = 'audit/web/articles/modern-yabejp-ja/chapter06-exercise003.dea1ba2453139b1ce13725be3bb195e85133a80c3a744db0166a247ca79f5899.json';
const PARENT_RECEIPT_SHA = '749e242c54019cb6b855a03e6df4fe465bed86e1cf50d7869be548a3b0144d40';
const PLAN_REL = 'web-production/v1/batch-plans/554a60a61861e50b108cb6488263bf449ca03a152f5b8b176b8ea7ac481d8421.json';
const PARENT_BATCH_DIR = 'audit/web/batches/dea1ba2453139b1ce13725be3bb195e85133a80c3a744db0166a247ca79f5899/554a60a61861e50b108cb6488263bf449ca03a152f5b8b176b8ea7ac481d8421';
const GROUPS = ['003', '005', '006', '008'];

const sha = b => createHash('sha256').update(b).digest('hex');
const abs = p => join(ROOT, p);
const exists = async p => { try { await readFile(abs(p)); return true; } catch (e) { if (e.code === 'ENOENT') return false; throw e; } };

const argGroup = (process.argv[2] ?? '').padStart(3, '0');
const dryRun = process.argv.includes('--dry-run');
if (!GROUPS.includes(argGroup)) { console.log(JSON.stringify({error: 'usage: node _recheck_283_table_context_group.mjs ' + GROUPS.join('|')})); process.exit(2); }
const BATCH_ID = `chapter06-exercise003-batch-${argGroup}`;
const OUT_REL = `audit/web/adjudications/group-revision-283-1/table-context-recheck-${argGroup}-20261027.rev2.json`;
if (await exists(OUT_REL)) { console.log(JSON.stringify({skipped: 'recheck already recorded', out: OUT_REL})); process.exit(0); }

const {auditModel, auditReasoningEffort, auditUsageFromEvents, auditTransportCompleted} = await import(pathToFileURL(join(RUNTIME, 'textbook-audit.mjs')).href);
const {invokeTextbookCodex, hasUnexpectedTextbookTool} = await import(pathToFileURL(join(RUNTIME, 'textbook-production-cli.mjs')).href);
const {webSemanticProjection} = await import(pathToFileURL(join(RUNTIME, 'textbook-audit-web.mjs')).href);

const candBytes = await readFile(abs(CAND_REL));
if (sha(candBytes) !== CAND_SHA) throw Error('candidate changed');
const srcBytes = await readFile(abs(SRC_REL));
if (sha(srcBytes) !== SRC_SHA) throw Error('source changed');
const receiptBytes = await readFile(abs(RECEIPT_REL));
if (sha(receiptBytes) !== RECEIPT_SHA) throw Error('audit receipt changed');
const receipt = JSON.parse(receiptBytes.toString('utf8'));
const parentReceiptBytes = await readFile(abs(PARENT_RECEIPT_REL));
if (sha(parentReceiptBytes) !== PARENT_RECEIPT_SHA) throw Error('parent receipt changed');
const parentReceipt = JSON.parse(parentReceiptBytes.toString('utf8'));
const parentCandBytes = await readFile(abs(PARENT_CAND_REL));
if (sha(parentCandBytes) !== PARENT_CAND_SHA) throw Error('parent candidate changed');

const candidate = JSON.parse(candBytes.toString('utf8'));
const source = JSON.parse(srcBytes.toString('utf8'));
const plan = JSON.parse(await readFile(abs(PLAN_REL), 'utf8'));
const group = plan.groups.find(g => g.batchId === BATCH_ID);
if (!group) throw Error('group missing from plan');

const checkpointRel = `${PARENT_BATCH_DIR}/${BATCH_ID}.json`;
const checkpointBytes = await readFile(abs(checkpointRel));
const checkpoint = JSON.parse(checkpointBytes.toString('utf8'));
const findings = (checkpoint.modelReview.issues ?? []).filter(i => i.severity === 'error').map(i => ({
  targetId: i.targetId,
  issueSha256: sha(JSON.stringify(i)),
  sourceEvidence: i.sourceEvidence,
  description: i.description,
  suggestedRepair: i.suggestedRepair ?? null,
}));
const deferred = (candidate.provenance.revision.groupRevision.deferred ?? []).filter(d => d.batchId === BATCH_ID);
if (findings.length !== deferred.length || findings.some(f => !deferred.some(d => d.targetId === f.targetId && d.issueSha256 === f.issueSha256))) {
  throw Error('finding set does not match the deferred difference set');
}
if (!checkpoint.status.startsWith('needs-repair')) throw Error('group checkpoint is not needs-repair');

// --- projection: the group's own complete-unit blocks, no images attached (image content
// --- already carries the parent group's independent review; this check is table position only)
const selected = new Set([...(group.sourceBlockIds ?? []), ...(group.contextSourceBlockIds ?? [])]);
const scopeBlocks = source.blocks.filter(b => selected.has(b.id));
if (!scopeBlocks.length) throw Error('empty group scope');
const assetIds = new Set(scopeBlocks.flatMap(b => b.images ?? []).map(i => i.assetId));
const scopedSource = {
  url: source.url, title: source.title, language: source.language,
  blocks: scopeBlocks,
  assets: (source.assets ?? []).filter(a => assetIds.has(a.assetId)),
  tables: (source.tables ?? []).filter(t => (t.sourceBlockIds ?? []).some(id => selected.has(id))),
};
const scopedCandidate = {
  ...candidate,
  body: {...candidate.body, blocks: candidate.body.blocks.filter(b => selected.has(b.sourceBlockIds?.[0]))},
  figures: candidate.figures.filter(f => selected.has(f.sourceBlockIds?.[0])),
};
const projection = webSemanticProjection(scopedSource, scopedCandidate, [...assetIds], [], true, 3);
projection.schema = 'coach-web-table-context-bounded-recheck-projection/1';
projection.projectionVersion = 3;
projection.reviewScope = {
  batchId: BATCH_ID,
  scope: 're-decide only the listed findings; everything else in this group keeps its parent independent group review',
  findings: findings.map(f => ({targetId: f.targetId, originalReviewClaim: f.description})),
  candidateFigureTableContext: 'candidate figure blocks below carry their real tableContext (projectionVersion 3); this is the field the parent review could not see',
  notInScope: 'card faces, translations, figure transcriptions and every block outside these findings; do not raise new findings about them',
};

// deterministic cross-check kept out of the prompt (recorded only)
const sourceById = new Map(source.blocks.map(b => [b.id, b]));
const tableBinding = scopedCandidate.body.blocks
  .filter(b => b.type === 'figure')
  .map(b => {
    const srcBlock = sourceById.get(b.sourceBlockIds[0]);
    return {
      sourceBlockId: b.sourceBlockIds[0], figureId: b.figureId,
      candidateTableContext: b.tableContext ?? null, sourceTableContext: srcBlock?.tableContext ?? null,
      equal: JSON.stringify(b.tableContext ?? null) === JSON.stringify(srcBlock?.tableContext ?? null),
    };
  });
const tableBindingMismatches = tableBinding.filter(r => !r.equal);
const figuresWithContext = scopedCandidate.body.blocks.filter(b => b.type === 'figure' && b.tableContext).length;

// --- prompt
const findingText = findings.map((f, i) => `争议${i + 1}：targetId = ${f.targetId}\n  原审校说法：${f.description}\n  原审校给出的源依据：${f.sourceEvidence}`).join('\n\n');
const prompt = [
  '你独立复核一组表格位相关的审校争议，只重新裁决下面列出的争议项。这不是整组重审：该组其余文本、牌面、牌图转写都已由父独立审校逐项覆盖并继承其结论，不得重复报告，也不得就它们提出新问题。不得使用任何工具、网络或本次输入之外的材料。',
  `上一轮审校看到的是候选 figure 块投影，其中不含候选自己的 tableContext，因此它只能看到「候选没有表格位」这一表象。本次输入已按 projectionVersion 3 补齐：候选每个 figure 块都带上它真实持有的 tableContext（tableId、row、column、rowspan、colspan、header），source 侧同时给出 tableContext 与 source.tables 的完整行/列/span/表头结构。这就是本次要复核的输入差集。`,
  `本组共 ${findings.length} 项争议：\n\n${findingText}`,
  '请对每一项：先在 projection 的 source.tables 里定位该表，再逐个核对该表下的候选 figure 块 tableContext 是否真实承载了它应有的格位（tableId 一致、row/column 与源表格结构相容、rowspan/colspan 如实、表头标记如实）；据此判断原审校所指「候选遗漏表格定位/无表格结构承载座位与弃牌列、箭头对齐」是否成立。',
  '判定口径：若候选确实通过 figure 块 tableContext 保留了该牌位的表格格位，且与 source 表格结构一致，判 faithful，并说明是哪几个块承载了这些格位；若候选真的缺失或错置格位，判 needs-repair 并列出这些块；证据不足以判定时判 uncertain。不要为了让任何一方通过而放宽标准，也不要把「未知牌」当成已知。',
  'inheritedScopeOnly 表示你确实只裁定了这些争议项、没有改动或重报范围外内容。',
  '输出严格符合 schema 的 JSON。只输出 JSON，不要输出任何其它文字。',
  JSON.stringify(projection),
].join('\n\n');
if (!prompt.includes(JSON.stringify(projection)) || prompt.length < JSON.stringify(projection).length) throw Error('projection_not_embedded_in_prompt');

const schema = {
  type: 'object', additionalProperties: false,
  properties: {
    findings: {
      type: 'array', minItems: findings.length, maxItems: findings.length,
      items: {
        type: 'object', additionalProperties: false,
        properties: {
          targetId: {enum: findings.map(f => f.targetId)},
          verdict: {enum: ['faithful', 'needs-repair', 'uncertain']},
          candidateTableContextFaithful: {type: 'boolean'},
          evidence: {type: 'string', minLength: 1},
          unresolvedBlockIds: {type: 'array', items: {type: 'string'}},
        },
        required: ['targetId', 'verdict', 'candidateTableContextFaithful', 'evidence', 'unresolvedBlockIds'],
      },
    },
    inheritedScopeOnly: {type: 'boolean'},
    summary: {type: 'string', minLength: 1},
  },
  required: ['findings', 'inheritedScopeOnly', 'summary'],
};

if (dryRun) {
  console.log(JSON.stringify({
    dryRun: true, batchId: BATCH_ID,
    findings, figuresInScope: scopedCandidate.body.blocks.filter(b => b.type === 'figure').length,
    figuresWithTableContext: figuresWithContext, tablesInScope: scopedSource.tables.length,
    projectionBytes: Buffer.byteLength(JSON.stringify(projection)), promptBytes: Buffer.byteLength(prompt),
    tableBindingMismatches: tableBindingMismatches.length,
    schemaTargetEnums: schema.properties.findings.items.properties.targetId.enum,
  }, null, 1));
  process.exit(0);
}

const callId = randomUUID(), startedAt = new Date().toISOString();
const result = await invokeTextbookCodex({prompt, schema, model: auditModel, reasoningEffort: auditReasoningEffort, images: [], timeoutMs: 900000});
const usage = auditUsageFromEvents(result.events ?? []), output = result.output;
const unexpectedTool = hasUnexpectedTextbookTool(result.events ?? [], {allowRecoveredTransportDiagnostics: auditTransportCompleted(result)});
const success = auditTransportCompleted(result) && usage !== null && !unexpectedTool;
const projectionBytes = Buffer.from(JSON.stringify(projection)), promptBytes = Buffer.from(prompt);
const binding = {
  source: candidate.source, productionSha256: CAND_SHA, sourceFileSha256: SRC_SHA,
  parentCandidate: {path: PARENT_CAND_REL, sha256: PARENT_CAND_SHA},
  parentReceipt: {path: PARENT_RECEIPT_REL, sha256: PARENT_RECEIPT_SHA},
  parentCheckpoint: {path: checkpointRel, sha256: sha(checkpointBytes)},
  plan: {path: PLAN_REL, sha256: sha(await readFile(abs(PLAN_REL)))},
  batchId: BATCH_ID, group,
  scope: 'table-position-findings-only-limited-recheck',
  auditorSnapshot: receipt.auditor,
  semanticProjectionSha256: sha(projectionBytes),
  semanticProjectionVersion: 3,
  imageBindings: [],
};
const call = {
  schema: 'coach-textbook-audit-call/1', callId, ...binding, startedAt, finishedAt: new Date().toISOString(),
  scopeTag: 'textbook-web-table-context-limited-recheck',
  model: auditModel, reasoningEffort: auditReasoningEffort,
  parameters: {webSearch: 'disabled', tools: 'capability-restricted', ephemeral: true, ignoreUserConfig: true, ignoreRules: true, sandbox: 'read-only', timeoutMs: 900000},
  promptSha256: sha(promptBytes), semanticPromptSha256: sha(promptBytes), requestPrompt: result.requestPrompt ?? null,
  requestPromptSha256: result.requestPromptSha256 ?? null, schemaSha256: sha(JSON.stringify(schema)),
  success, usage, exitCode: result.exitCode, timedOut: result.timedOut, outputOverflow: result.outputOverflow, unexpectedTool,
  transportDiagnostics: (result.events ?? []).filter(e => e.type === 'error'),
  failure: success ? null : {stderr: result.stderr, eventErrors: (result.events ?? []).filter(e => ['turn.failed', 'error'].includes(e.type))},
  outputSha256: output ? sha(JSON.stringify(output)) : null, structuredOutput: output,
  rawLastMessage: result.rawLastMessage ?? null, rawStdout: result.rawStdout ?? null, events: result.events ?? [],
};
if (!success) { console.log(JSON.stringify({failed: true, batchId: BATCH_ID, callId, failure: call.failure, usage}, null, 1)); process.exit(1); }
await mkdir(abs('audit/calls'), {recursive: true});
const callPath = `audit/calls/${callId}.json`;
await writeFile(abs(callPath), JSON.stringify({...call, prompt, schema}, null, 2) + '\n', {flag: 'wx'});
await appendFile(abs('audit/calls.jsonl'), JSON.stringify({...call, events: undefined}) + '\n');
const callSha = sha(await readFile(abs(callPath)));

// --- validation
const errors = [];
const got = output.findings ?? [];
if (got.length !== findings.length) errors.push('finding_count');
if (new Set(got.map(f => f.targetId)).size !== got.length) errors.push('duplicate_target');
for (const f of findings) {
  const r = got.find(x => x.targetId === f.targetId);
  if (!r) { errors.push('missing_target:' + f.targetId); continue; }
  if (r.verdict === 'faithful' && (r.unresolvedBlockIds ?? []).length) errors.push('faithful_with_open_blocks:' + f.targetId);
  if (r.verdict !== 'faithful' && !(r.evidence ?? '').trim()) errors.push('no_evidence:' + f.targetId);
}
if (output.inheritedScopeOnly !== true) errors.push('scope_not_limited');

const allFaithful = errors.length === 0 && got.every(f => f.verdict === 'faithful');
const record = {
  schema: 'coac-web-table-context-group-recheck/1',
  recordedAt: new Date().toISOString(),
  chapterId: 'nemata-jp-chapter-283-1',
  articleId: 'chapter06-exercise003',
  batchId: BATCH_ID,
  candidate: {path: CAND_REL, sha256: CAND_SHA, unchangedByThisCheck: true},
  source: {path: SRC_REL, sha256: SRC_SHA},
  parentCheckpoint: {path: checkpointRel, sha256: sha(checkpointBytes), status: checkpoint.status},
  auditReceipt: {path: RECEIPT_REL, sha256: RECEIPT_SHA, status: receipt.status},
  modelCalls: 1,
  productionCalls: 0,
  scope: {
    what: 'bounded re-decision of this group\'s table-position findings with the candidate figure tableContext projected (projectionVersion 3)',
    notInScope: ['card faces', 'translations', 'figure transcriptions', 'every block outside the listed findings', 'the other three groups', 'the passed groups 002/004/009/011'],
    notCleared: 'the parent group checkpoint and the chapter audit receipt are untouched; no parent verdict is rewritten',
  },
  inputDelta: {
    whatTheReviewSaw: 'candidate figure blocks carried type/sourceBlockIds/paragraphId/figureId only; candidate tableContext was not projected',
    whatWasAdded: 'candidate figure block tableContext via projectionVersion 3, plus source.tables for the tables in scope',
    figuresInScope: scopedCandidate.body.blocks.filter(b => b.type === 'figure').length,
    figuresWithTableContext: figuresWithContext,
    tablesInScope: scopedSource.tables.length,
    deterministicTableBindingMismatches: tableBindingMismatches.length,
    deterministicTableBinding: tableBinding,
  },
  findings: findings.map(f => {
    const r = got.find(x => x.targetId === f.targetId);
    return {...f, verdict: r?.verdict ?? 'missing', candidateTableContextFaithful: r?.candidateTableContextFaithful ?? null, recheckEvidence: r?.evidence ?? null, unresolvedBlockIds: r?.unresolvedBlockIds ?? []};
  }),
  groupOutcome: !errors.length ? (allFaithful ? 'all-listed-findings-faithful' : 'remaining-findings-open') : 'invalid-response',
  validationErrors: errors,
  inheritedScopeOnly: output.inheritedScopeOnly,
  summary: output.summary,
  modelCall: {callId, sha256: callSha, outputSha256: call.outputSha256, usage},
  recordedVerdict: 'no parent verdict rewritten; this record is the independent re-decision for the listed findings only',
};
await mkdir(dirname(abs(OUT_REL)), {recursive: true});
await writeFile(abs(OUT_REL), JSON.stringify(record, null, 2) + '\n', {flag: 'wx'});
console.log(JSON.stringify({batchId: BATCH_ID, callId, usage, groupOutcome: record.groupOutcome, validationErrors: errors, findings: record.findings.map(f => ({targetId: f.targetId, verdict: f.verdict, unresolved: f.unresolvedBlockIds.length})), out: OUT_REL, outSha256: sha(await readFile(abs(OUT_REL)))}, null, 1));
