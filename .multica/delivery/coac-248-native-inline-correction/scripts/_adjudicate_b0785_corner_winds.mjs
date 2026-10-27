// One bounded independent adjudication of the 283-1 / batch-007 centre corner-wind dispute.
// One scoped model call, no production, no page re-review. Records a normal audit call
// and writes a source-adjudication decision bound to the current candidate and receipt.
import {readFile, writeFile, appendFile, mkdir} from 'node:fs/promises';
import {createHash, randomUUID} from 'node:crypto';
import {join, dirname} from 'node:path';
import {pathToFileURL} from 'node:url';

const ROOT = 'E:/AgentData/Coach/knowledge/processing';
const RUNTIME_REL = 'audit/runtimes/web-group-revision-20261027-frozen-4bd6e4fc';
const RUNTIME = join(ROOT, RUNTIME_REL);
const CAND_REL = 'web-production/v1/candidates/modern-yabejp-ja/chapter06-exercise003.rev2.json';
const CAND_SHA = '849267b84c85544fc8378ec8e462be1a2101766c40726dbd77ce7558c67c50f3';
const RECEIPT_REL = 'audit/web/articles/modern-yabejp-ja/chapter06-exercise003.849267b84c85544fc8378ec8e462be1a2101766c40726dbd77ce7558c67c50f3.json';
const RECEIPT_SHA = '21d909b832c28e62a76f453863ed24d8fc8738adbb54b36bfd8117b9395d5aea';
const CHECKPOINT_REL = 'audit/web/batches/849267b84c85544fc8378ec8e462be1a2101766c40726dbd77ce7558c67c50f3/554a60a61861e50b108cb6488263bf449ca03a152f5b8b176b8ea7ac481d8421/chapter06-exercise003-batch-007.json';
const CHECKPOINT_SHA = '9fa518acb13dbdfac78129917d547b1ad38a7e54c53cd8938a83de66c0b9af85';
const EVIDENCE_REL = 'audit/web/adjudications/group-revision-283-1/b0785-corner-evidence-20261027.json';
const OUT_REL = 'audit/web/adjudications/group-revision-283-1/b0785-corner-winds-adjudication-20261027.json';
const FIGURE_ID = 'modern-yabejp-ja:chapter06-exercise003:b0785:figure';
const BATCH_ID = 'chapter06-exercise003-batch-007';

const sha = b => createHash('sha256').update(b).digest('hex');
const abs = p => join(ROOT, p);
const exists = async p => { try { await readFile(abs(p)); return true; } catch (e) { if (e.code === 'ENOENT') return false; throw e; } };

if (await exists(OUT_REL)) { console.log(JSON.stringify({skipped: 'adjudication already recorded', out: OUT_REL})); process.exit(0); }

const {auditModel, auditReasoningEffort, auditUsageFromEvents, auditTransportCompleted} = await import(pathToFileURL(join(RUNTIME, 'textbook-audit.mjs')).href);
const {invokeTextbookCodex, hasUnexpectedTextbookTool} = await import(pathToFileURL(join(RUNTIME, 'textbook-production-cli.mjs')).href);

const candBytes = await readFile(abs(CAND_REL));
if (sha(candBytes) !== CAND_SHA) throw Error('candidate changed');
const receiptBytes = await readFile(abs(RECEIPT_REL));
if (sha(receiptBytes) !== RECEIPT_SHA) throw Error('audit receipt changed');
const receipt = JSON.parse(receiptBytes.toString('utf8'));
if (receipt.status !== 'needs-repair' || receipt.method !== 'independent-sol-high-complete-unit-batch-group-revision') throw Error('receipt shape changed');
const checkpointBytes = await readFile(abs(CHECKPOINT_REL));
if (sha(checkpointBytes) !== CHECKPOINT_SHA) throw Error('batch-007 checkpoint changed');
const checkpoint = JSON.parse(checkpointBytes.toString('utf8'));
const record = checkpoint.modelReview;
const issues = (record.issues ?? []).filter(i => i.targetId === FIGURE_ID);
if (checkpoint.status !== 'needs-repair' || issues.length !== 1 || issues[0].severity !== 'error') throw Error('disputed issue changed');
const figureCheck = (record.figureChecks ?? []).find(c => c.id === FIGURE_ID);
if (!figureCheck || figureCheck.verdict !== 'needs-repair' || figureCheck.preservedUnknowns?.acknowledged !== true) throw Error('figure check changed');
const evidenceBytes = await readFile(abs(EVIDENCE_REL));
const evidence = JSON.parse(evidenceBytes.toString('utf8'));
if (evidence.candidate.sha256 !== CAND_SHA || evidence.figureId !== FIGURE_ID) throw Error('evidence binding changed');

const ordered = ['board', 'panel', 'corner_tl', 'corner_tr', 'corner_bl', 'corner_br', 'round_label'].map(n => {
  const c = evidence.crops.find(x => x.name === n);
  if (!c) throw Error('missing crop ' + n);
  return c;
});
const images = ordered.map(c => abs(c.path));
const imageList = ordered.map((c, i) => `图${i + 1} = ${c.name}（${c.purpose}；原图裁切框 [${c.bboxInBoundOriginal.join(', ')}]，最近邻放大 ${c.scale}×，${c.outputPixels.join('×')}）`).join('\n');

const prompt = [
  '这是对一处已记录的审校争议做一次独立裁决。只裁决所附「中央四角方位字样」这一句，不审整页、不审其他牌例，也不审该图的未知项。不得使用任何工具、网络或本次输入之外的材料。',
  `全部图片都裁自同一张绑定原图（SHA-256 ${evidence.sourceAsset.sha256}，${evidence.sourceAsset.pixels.join('×')} 像素），只是不同区域的最近邻放大，没有换图、没有改像素：\n${imageList}`,
  '争议句：候选 figure 转录写「四角方位字样按画面位置为：左上东、右上北、左下南、右下西。」；本批独立审校写「原图中央四角方位为：左上西、右上北、左下南、右下东」，并称候选把左上与右下的东、西对调。右上「北」、左下「南」两边没有争议。',
  '判定要求：',
  '1. 逐个角落自己看字形笔画，先写出能区分的笔画结构（例如是否有贯穿中央的长竖、下部是否收成撇捺、框内是否为「儿」形、上半是否为「一」加封闭外框），再下结论。不得只凭「四方按某方向旋转」这类一般几何规则推字，几何/座次只能作为交叉校对，不能代替看图。',
  '2. 座次交叉校对：从图中指出四家分别位于画面哪一侧（下方手牌上方有一枚橙色「東」标记牌可作为座次线索），并说明你所采用的四角字样与座次的对应关系；再判断四个字样按画面顺时针顺序是否构成有效的风位循环。对应关系无法从本图确定时，必须明确写 undetermined，不得臆造。',
  '3. 只在这两种读法中裁决；两边都不成立时给 undetermined。不要为了让某一方通过而改动正确牌字。',
  '4. 若判定候选读法成立，另给出该句是否可原样保留；若判定审校读法成立，给出应改成的整句。',
  '输出严格符合 schema 的 JSON，evidence 用简洁中文写出可见依据。',
].join('\n\n');

const schema = {
  type: 'object', additionalProperties: false,
  properties: {
    cornerReadings: {
      type: 'array', minItems: 4, maxItems: 4,
      items: {
        type: 'object', additionalProperties: false,
        properties: {
          corner: {enum: ['topLeft', 'topRight', 'bottomLeft', 'bottomRight']},
          reading: {enum: ['東', '南', '西', '北', 'indeterminate']},
          strokes: {type: 'string', minLength: 1},
        },
        required: ['corner', 'reading', 'strokes'],
      },
    },
    seatCrossCheck: {
      type: 'object', additionalProperties: false,
      properties: {
        mappingDeterminable: {type: 'boolean'},
        cornerToPlayer: {type: 'string'},
        cyclicOrderConsistent: {enum: ['consistent', 'inconsistent', 'undetermined']},
        evidence: {type: 'string', minLength: 1},
      },
      required: ['mappingDeterminable', 'cornerToPlayer', 'cyclicOrderConsistent', 'evidence'],
    },
    verdict: {enum: ['candidate-faithful', 'reviewer-faithful', 'undetermined']},
    candidateSentenceRetained: {type: 'boolean'},
    correctedSentence: {type: ['string', 'null']},
    evidence: {type: 'string', minLength: 1},
  },
  required: ['cornerReadings', 'seatCrossCheck', 'verdict', 'candidateSentenceRetained', 'correctedSentence', 'evidence'],
};

const callId = randomUUID(), startedAt = new Date().toISOString();
const result = await invokeTextbookCodex({prompt, schema, model: auditModel, reasoningEffort: auditReasoningEffort, images, timeoutMs: 900000});
const usage = auditUsageFromEvents(result.events ?? []), output = result.output;
const unexpectedTool = hasUnexpectedTextbookTool(result.events ?? [], {allowRecoveredTransportDiagnostics: auditTransportCompleted(result)});
const success = auditTransportCompleted(result) && usage !== null && !unexpectedTool;
const binding = {
  source: evidence.source,
  productionSha256: CAND_SHA,
  sourceFileSha256: evidence.source.sha256,
  auditReceipt: {path: RECEIPT_REL, sha256: RECEIPT_SHA},
  batchCheckpoint: {path: CHECKPOINT_REL, sha256: CHECKPOINT_SHA},
  auditorSnapshot: receipt.auditor,
  scope: 'single-corner-glyph-dispute-adjudication-not-page-review',
  evidencePackage: {path: EVIDENCE_REL, sha256: sha(evidenceBytes)},
  semanticProjectionSha256: sha(evidenceBytes),
  imageBindings: ordered.map(c => ({name: c.name, path: c.path, sha256: c.sha256, bboxInBoundOriginal: c.bboxInBoundOriginal, scale: c.scale})),
};
const call = {
  schema: 'coach-textbook-audit-call/1', callId, ...binding, startedAt, finishedAt: new Date().toISOString(),
  model: auditModel, reasoningEffort: auditReasoningEffort,
  parameters: {webSearch: 'disabled', tools: 'capability-restricted', ephemeral: true, ignoreUserConfig: true, ignoreRules: true, sandbox: 'read-only', timeoutMs: 900000},
  promptSha256: sha(prompt), semanticPromptSha256: sha(prompt), requestPrompt: result.requestPrompt ?? null,
  requestPromptSha256: result.requestPromptSha256 ?? null, schemaSha256: sha(JSON.stringify(schema)),
  success, usage, exitCode: result.exitCode, timedOut: result.timedOut, outputOverflow: result.outputOverflow, unexpectedTool,
  transportDiagnostics: (result.events ?? []).filter(e => e.type === 'error'),
  failure: success ? null : {stderr: result.stderr, eventErrors: (result.events ?? []).filter(e => ['turn.failed', 'error'].includes(e.type))},
  outputSha256: output ? sha(JSON.stringify(output)) : null, structuredOutput: output,
  rawLastMessage: result.rawLastMessage ?? null, rawStdout: result.rawStdout ?? null, events: result.events ?? [],
};
if (!success) { console.log(JSON.stringify({failed: true, callId, failure: call.failure, usage}, null, 1)); process.exit(1); }
await mkdir(abs('audit/calls'), {recursive: true});
const callPath = `audit/calls/${callId}.json`;
await writeFile(abs(callPath), JSON.stringify(call, null, 2) + '\n', {flag: 'wx'});
await appendFile(abs('audit/calls.jsonl'), JSON.stringify({...call, events: undefined}) + '\n');
const callSha = sha(await readFile(abs(callPath)));

const readingByCorner = Object.fromEntries(output.cornerReadings.map(c => [c.corner, c.reading]));
const candidateReading = {topLeft: '東', topRight: '北', bottomLeft: '南', bottomRight: '西'};
const reviewerReading = {topLeft: '西', topRight: '北', bottomLeft: '南', bottomRight: '東'};
const agrees = r => Object.keys(candidateReading).every(k => readingByCorner[k] === r[k]);

const decision = {
  schema: 'coach-textbook-source-adjudication/1',
  status: output.verdict === 'undetermined' ? 'undetermined-with-source-evidence' : 'resolved-with-source-evidence',
  chapterId: 'nemata-jp-chapter-283-1',
  articleId: 'chapter06-exercise003',
  batchId: BATCH_ID,
  productionSha256: CAND_SHA,
  source: evidence.source,
  originalAudit: {path: RECEIPT_REL, sha256: RECEIPT_SHA, callIds: receipt.calls.map(c => c.callId)},
  originalCheckpoint: {path: CHECKPOINT_REL, sha256: CHECKPOINT_SHA, status: checkpoint.status},
  approval: {
    authority: 'root',
    scope: 'corner-orientation-dispute-only',
    reference: 'Root authorised at most five independent reviews with zero production for 283-1, of which one is solely the batch-007 corner-orientation adjudication, evidenced by the bound original image/strokes together with seat order and not by a generic geometric rule (COAC-248 comment 01a17c22-afcb-750a-9bb6-6e9118d1a4ef).',
  },
  verification: 'root-authorized-source-adjudication-with-independent-model-recheck-not-full-page-pass-not-user-human-gold-standard',
  evidencePackage: {path: EVIDENCE_REL, sha256: sha(evidenceBytes)},
  modelAdjudication: {callId, sha256: callSha, outputSha256: call.outputSha256, verdict: output.verdict, review: output},
  readings: {
    candidate: candidateReading, reviewer: reviewerReading, adjudicated: readingByCorner,
    adjudicatedMatchesCandidate: agrees(candidateReading),
    adjudicatedMatchesReviewer: agrees(reviewerReading),
  },
  resolutions: [{
    issueIndex: 0,
    issueSha256: sha(JSON.stringify(issues[0])),
    targetId: FIGURE_ID,
    decision: output.verdict,
    reason: output.evidence,
    sentenceRetained: output.candidateSentenceRetained,
    correctedSentence: output.correctedSentence,
    affectedReviewChecks: [{key: 'figureChecks', id: FIGURE_ID, verdict: figureCheck.verdict, sha256: sha(JSON.stringify(figureCheck))}],
    preservedUnknowns: figureCheck.preservedUnknowns,
    unknownsTouchedByThisAdjudication: false,
  }],
  recordedAt: new Date().toISOString(),
};
await mkdir(dirname(abs(OUT_REL)), {recursive: true});
await writeFile(abs(OUT_REL), JSON.stringify(decision, null, 2) + '\n', {flag: 'wx'});
console.log(JSON.stringify({callId, verdict: output.verdict, readings: readingByCorner, usage, decision: OUT_REL, decisionSha256: sha(await readFile(abs(OUT_REL)))}, null, 1));
