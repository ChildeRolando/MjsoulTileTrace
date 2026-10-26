import {readFile, readdir, writeFile, mkdir, copyFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {join, dirname} from 'node:path';
import {isDeepStrictEqual as same} from 'node:util';

const ROOT = 'E:/AgentData/Coach/knowledge/processing';
const PARENT_ROOT_REL = 'production/sol-high-fallback-inline-20261026';
const sha = b => createHash('sha256').update(b).digest('hex');
const abs = p => join(ROOT, p);
const writeJson = async (p, v) => { await mkdir(dirname(abs(p)), {recursive: true}); await writeFile(abs(p), JSON.stringify(v, null, 2) + '\n'); };
const marker = /\[\[figure:([^\]\r\n]+)\]\]/g;

// Same rendering rule the frozen native-inline gate applies to rawSlotText.
function render(rawSlotText, figures) {
  const parts = [];
  let at = 0;
  for (const m of rawSlotText.matchAll(marker)) {
    const f = figures.find(x => x.figureId === m[1]);
    if (!f) throw Error('unknown figure in slot: ' + m[1]);
    if (m.index > at) parts.push({type: 'text', text: rawSlotText.slice(at, m.index)});
    parts.push({type: 'figure', figureId: f.figureId, text: f.caption});
    at = m.index + m[0].length;
  }
  if (at < rawSlotText.length) parts.push({type: 'text', text: rawSlotText.slice(at)});
  return {parts, text: parts.map(p => p.text).join(''), inlineFigureIds: [...rawSlotText.matchAll(marker)].map(m => m[1])};
}

const PAGES = [
  {
    page: 261,
    parentShaPrefix: 'b63d2c602ec030eb9c2d5f7852e5119363391f8f9ba24992bbfab42fc847ecd7',
    root: 'production/sol-high-field-repair18-20261027-p261',
    callId: '67bf982c-f150-415d-9ab4-3c8abe106f19',
    blockIds: ['nemata-jp-p261-b1', 'nemata-jp-p261-b2', 'nemata-jp-p261-b3', 'nemata-jp-p261-b4', 'nemata-jp-p261-b5'],
    from: '必须恰好摸入[[figure:nemata-jp-p261-r8]]或[[figure:nemata-jp-p261-r9]]',
    to: '必须恰好摸入[[figure:nemata-jp-p261-r8]]和[[figure:nemata-jp-p261-r9]]',
    sourceEvidence: 'Source page block nemata-jp-p261-b4 reads 「三色は手広い１シャンテンのなかからピンポイントに［5p］･［7p］を引かなければ成立しない」 — the two tiles are joined conjunctively, so both are required, not either one. The example hand after 摸5p also shows 56p waiting on 7p.',
    sourceTextEvidence: [{sourceBlockId: 'nemata-jp-p261-b4', contains: 'を引かなければ成立しない'}],
    crop: {path: 'production/sol-high-fallback-inline-20261026/renders/nemata-jp/page-0261.png', sha256: 'f1e73af94b2c87eada820d89c0fa09ad4c8556bd95a91f1f2d07fa17f20bd750'},
  },
  {
    page: 262,
    parentShaPrefix: '0025a1f80f4ceb7cba97f8c9382b02719701370e75af87a537c0130f3a2c604f',
    root: 'production/sol-high-field-repair19-20261027-p262',
    callId: '69586b53-55eb-48bb-b337-1a1d603bdf7a',
    blockIds: ['nemata-jp-p262-b16', 'nemata-jp-p262-b17', 'nemata-jp-p262-b18', 'nemata-jp-p262-b19'],
    from: '可形成三面听',
    to: '可形成三面形',
    sourceEvidence: 'Source page block nemata-jp-p262-b17 reads 「３ｓ引きで三面」 — the three-sided shape of the suit, with no claim that the whole hand reaches tenpai; the exercise hand is not one tile from tenpai.',
    sourceTextEvidence: [{sourceBlockId: 'nemata-jp-p262-b17', contains: '引きで三面'}],
    crop: {path: 'production/sol-high-fallback-inline-20261026/renders/nemata-jp/page-0262.png', sha256: '71d8b7e4cd537db15508a611bb075cb9df112ace3029487b78cff9ff1e595049'},
  },
];

async function originalAuditPath(page, prefix) {
  const dir = join(ROOT, 'audit/pages/nemata-jp');
  const hit = (await readdir(dir)).filter(f => f.includes(`page-0${page}.${prefix}.`));
  if (hit.length !== 1) throw Error(`original audit not unique for page ${page}: ${hit.join(',')}`);
  return `audit/pages/nemata-jp/${hit[0]}`;
}

for (const spec of PAGES) {
  const pageNo = String(spec.page).padStart(4, '0');
  const parentPath = `${PARENT_ROOT_REL}/candidates/nemata-jp/page-${pageNo}.json`;
  const parentBytes = await readFile(abs(parentPath));
  const parentSha256 = sha(parentBytes);
  if (parentSha256 !== spec.parentShaPrefix) throw Error(`parent sha mismatch on page ${spec.page}`);
  const parent = JSON.parse(parentBytes.toString('utf8'));
  const candidate = structuredClone(parent);

  const block = candidate.body.blocks.find(b => b.type === 'text' && same(b.sourceBlockIds, spec.blockIds));
  if (!block) throw Error('target block missing for page ' + spec.page);

  // self-check: the renderer must reproduce the parent block exactly before any change
  const before = render(block.rawSlotText, candidate.figures);
  if (!same(before.parts, block.inlineContent) || before.text !== block.text || !same(before.inlineFigureIds, block.inlineFigureIds)) {
    throw Error('renderer does not reproduce parent block on page ' + spec.page);
  }

  const rawText = await readFile(abs(`${PARENT_ROOT_REL}/raw-calls/${spec.callId}.json`), 'utf8');
  const rawBytes = Buffer.from(rawText, 'utf8');
  const raw = JSON.parse(rawText);
  const rawEntry = (raw.parsedOutput.pageFlow ?? []).find(f => f.kind === 'text' && same(f.sourceBlockIds, spec.blockIds));
  if (!rawEntry) throw Error('raw pageFlow entry missing for page ' + spec.page);
  if (rawEntry.text !== block.rawSlotText) throw Error('parent slot text differs from preserved raw on page ' + spec.page);
  if (rawEntry.text.split(spec.from).length - 1 !== 1) throw Error('raw text does not contain the replacement exactly once on page ' + spec.page);

  const newRaw = block.rawSlotText.replaceAll(spec.from, spec.to);
  const after = render(newRaw, candidate.figures);
  block.rawSlotText = newRaw;
  block.inlineContent = after.parts;
  block.text = after.text;
  block.inlineFigureIds = after.inlineFigureIds;

  const change = {
    target: 'paragraph',
    sourceBlockIds: spec.blockIds,
    fromValue: rawEntry.text,
    toValue: newRaw,
    replacements: [{from: spec.from, to: spec.to, occurrences: 1}],
    sourceEvidence: spec.sourceEvidence,
    sourceTextEvidence: spec.sourceTextEvidence,
    sourceCrop: spec.crop,
  };

  const notesPath = await originalAuditPath(spec.page, spec.parentShaPrefix);
  const notesBytes = await readFile(abs(notesPath));
  const sourcePagePath = `nemata-jp/pages/${spec.page}.json`;
  const sourcePageBytes = await readFile(abs(sourcePagePath));

  const candidatePath = `${spec.root}/candidates/nemata-jp/page-${pageNo}.json`;
  Object.assign(candidate.provenance, {
    sourceFieldCorrection: {
      schema: 'coach-native-inline-field-correction/1',
      sourceId: 'nemata-jp',
      page: spec.page,
      parentPath,
      parentSha256,
      notesPath,
      notesSha256: sha(notesBytes),
      originalProductionRaw: {path: `${PARENT_ROOT_REL}/raw-calls/${spec.callId}.json`, sha256: sha(rawBytes)},
      sourcePageDataSha256: sha(sourcePageBytes),
      newProductionModelCalls: 0,
      changes: [change],
    },
  });
  const withoutDigest = {...candidate};
  delete withoutDigest.candidateSha256;
  candidate.candidateSha256 = sha(JSON.stringify(withoutDigest));
  await writeJson(candidatePath, candidate);
  const candidateSha256 = sha(await readFile(abs(candidatePath)));

  const n = candidate.provenance.sourceFieldCorrection;
  const proofPath = `audit/source-corrections/proofs/native-inline-p${spec.page}.${candidateSha256}.json`;
  const proof = {
    schema: 'coach-native-inline-field-correction-proof/1',
    candidateSha256,
    parentSha256,
    parentPath,
    originalAudit: {path: notesPath, sha256: sha(notesBytes), status: 'needs-repair'},
    originalProductionRaw: n.originalProductionRaw,
    sourcePage: {path: sourcePagePath, sha256: sha(sourcePageBytes)},
    sourceFieldCorrection: n,
  };
  await writeJson(proofPath, proof);
  const proofSha256 = sha(await readFile(abs(proofPath)));

  const approvalPath = `audit/source-corrections/native-inline-field-corrections.p${spec.page}.root-acceptance.json`;
  const approval = {
    schema: 'coach-native-inline-field-corrections-approval/1',
    status: 'accepted-exact-native-field-corrections-only',
    approvedBy: 'root',
    approvedAt: '2026-10-27T00:00:00.000Z',
    approvalBasis: {
      commentId: '01a17a58-0179-7f34-9c66-812db9413a92',
      scope: `Only the audit-located, source-backed field change on nemata-jp page ${spec.page}; original production raw, parent candidate and failed audit retained. No new production call.`,
    },
    jobs: [{
      schema: 'coach-native-inline-field-correction-job/1',
      sourceId: 'nemata-jp',
      page: spec.page,
      candidatePath,
      candidateSha256,
      parentPath,
      parentSha256,
      originalAuditPath: notesPath,
      originalAuditSha256: sha(notesBytes),
      originalProductionRaw: n.originalProductionRaw,
      sourcePagePath,
      sourcePageDataSha256: n.sourcePageDataSha256,
      proofPath,
      proofSha256,
      changes: [change],
      originalReviewErrors: JSON.parse(notesBytes.toString('utf8')).modelChecks.errors,
    }],
  };
  await writeJson(approvalPath, approval);
  const approvalSha256 = sha(await readFile(abs(approvalPath)));

  // revision root housekeeping: manifest, one-line calls.jsonl, raw call, page render
  await copyFile(abs(`${PARENT_ROOT_REL}/manifest.json`), abs(`${spec.root}/manifest.json`));
  const callLine = (await readFile(abs(`${PARENT_ROOT_REL}/calls.jsonl`), 'utf8')).split('\n').filter(Boolean).find(l => JSON.parse(l).page === spec.page);
  if (!callLine) throw Error('call record missing for page ' + spec.page);
  await mkdir(abs(`${spec.root}/raw-calls`), {recursive: true});
  await writeFile(abs(`${spec.root}/calls.jsonl`), callLine + '\n');
  await copyFile(abs(`${PARENT_ROOT_REL}/raw-calls/${spec.callId}.json`), abs(`${spec.root}/raw-calls/${spec.callId}.json`));
  await mkdir(abs(`${spec.root}/renders/nemata-jp`), {recursive: true});
  await copyFile(abs(`${PARENT_ROOT_REL}/renders/nemata-jp/page-${pageNo}.png`), abs(`${spec.root}/renders/nemata-jp/page-${pageNo}.png`));

  console.log(JSON.stringify({page: spec.page, candidatePath, candidateSha256, parentSha256, notesPath, proofPath, proofSha256, approvalPath, approvalSha256, textAfter: block.text}, null, 1));
}
