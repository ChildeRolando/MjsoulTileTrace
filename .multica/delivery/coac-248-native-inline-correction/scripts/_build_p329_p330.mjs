import {readFile, writeFile, mkdir, copyFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {join, dirname} from 'node:path';

const ROOT = 'E:/AgentData/Coach/knowledge/processing';
const PARENT_ROOT_REL = 'production/sol-high-fallback-inline-20261026';
const sha = b => createHash('sha256').update(b).digest('hex');
const abs = p => join(ROOT, p);
const readJson = async p => JSON.parse(await readFile(abs(p), 'utf8'));
const writeJson = async (p, v) => { await mkdir(dirname(abs(p)), {recursive: true}); await writeFile(abs(p), JSON.stringify(v, null, 2) + '\n'); };

const PAGES = [
  {
    page: 329,
    root: 'production/sol-high-field-repair16-20261027-p329',
    callId: 'c673d867-60f6-4cb4-860d-af35cb4c9515',
    parentAudit: 'audit/pages/nemata-jp/page-0329.c0776e6c314da926e7550460b4534bf60e7547fb30ea0635e4f4b7587bd0b4f4.6baa4a7e1404.json',
    crop: 'production/sol-high-fallback-inline-20261026/renders/nemata-jp/page-0329-r1.png',
    build(candidate) {
      const old = candidate.body.blocks.find(b => (b.sourceBlockIds ?? []).includes('nemata-jp-p329-b22'));
      if (!old) throw Error('p329 block b22 missing');
      const to = old.rawSlotText + '\n\n（校注，非原文：原文此句作「雀頭固定、ターツ固定共に速度ではほぼ無し。」，疑脱一「差」字；译文「几乎没有差别」的比较对象系据上下文补足，并非原文明文。）';
      const change = {
        target: 'paragraph',
        sourceBlockIds: old.sourceBlockIds,
        fromValue: old.rawSlotText,
        toValue: to,
        replacements: [{from: '认为固定为雀头较好。', to: '认为固定为雀头较好。\n\n（校注，非原文：原文此句作「雀頭固定、ターツ固定共に速度ではほぼ無し。」，疑脱一「差」字；译文「几乎没有差别」的比较对象系据上下文补足，并非原文明文。）', occurrences: 1}],
        sourceEvidence: 'Source page block nemata-jp-p329-b22 reads 雀頭固定、ターツ固定共に速度ではほぼ無し。 — no comparison object (差) appears in the original sentence; the translation supplies it from context.',
        sourceTextEvidence: [{sourceBlockId: 'nemata-jp-p329-b22', contains: '雀頭固定、ターツ固定共に速度ではほぼ無し。'}],
        sourceCrop: {path: 'production/sol-high-fallback-inline-20261026/renders/nemata-jp/page-0329.png', sha256: 'ea8d8a3e094a616654aaab0cbf7c2f3d88458f4d623240e1cc709fb21f1dbcde'},
      };
      old.rawSlotText = to;
      old.text = to;
      old.inlineContent = [{type: 'text', text: to}];
      return [change];
    },
  },
  {
    page: 330,
    root: 'production/sol-high-field-repair17-20261027-p330',
    callId: '335549a9-3318-4597-b5a8-57bbce1a9091',
    parentAudit: 'audit/pages/nemata-jp/page-0330.859d1d577a7b7406ac3594b3beb9a30415d2acf3c588c09e8a427d1b59d0de8b.6baa4a7e1404.json',
    crop: null,
    build(candidate) {
      const spec = [
        {
          id: 'nemata-jp-p330-r1',
          crop: {path: 'production/sol-high-fallback-inline-20261026/renders/nemata-jp/page-0330-r1.png', sha256: 'e037eb29d33284d8be9de377c70fa2ed078ab4b9e2f06f1a7b748e2a66590f20'},
          evidence: 'Bound r1 crop of the original page: the six tiles read 一万 二万 三万 三万 三万 四万 left to right (123334m); there is no 5m in this hand.',
          transcription: [{from: '125554m', to: '123334m', occurrences: 1}, {from: '三张5m均为普通五万，非赤五', to: '三张3m均为普通三万', occurrences: 1}],
          caption: [{from: '125554m', to: '123334m', occurrences: 1}],
        },
        {
          id: 'nemata-jp-p330-r4',
          crop: {path: 'production/sol-high-fallback-inline-20261026/renders/nemata-jp/page-0330-r4.png', sha256: '3f42baa98e214abc54f58f4c0be7ba160c8ac4fb53d8ff3282d44c0abce8b777'},
          evidence: 'Bound r4 crop of the original page: the six tiles read 三万 四万 四万 五万 五万 五万 left to right (344555m); the first tile is 3m, so only three 5m are present.',
          transcription: [{from: '544555m', to: '344555m', occurrences: 1}, {from: '四张5m', to: '三张5m', occurrences: 1}],
          caption: [{from: '544555m', to: '344555m', occurrences: 1}],
        },
        {
          id: 'nemata-jp-p330-r22',
          crop: {path: 'production/sol-high-fallback-inline-20261026/renders/nemata-jp/page-0330-r22.png', sha256: '8af70cd264cc344f47951aa365b71eacdcf99a33501ee93133751248b903207d'},
          evidence: 'Bound r22 crop of the original page: the six tiles read 三万 三万 四万 五万 六万 六万 left to right (334566m); only one 5m is present.',
          transcription: [{from: '554566m', to: '334566m', occurrences: 1}, {from: '三张5m均为普通五万', to: '一张5m为普通五万', occurrences: 1}],
          caption: [{from: '554566m', to: '334566m', occurrences: 1}],
        },
      ];
      const apply = (value, reps) => {
        let out = value;
        for (const r of reps) {
          if (out.split(r.from).length - 1 !== r.occurrences) throw Error('not unique: ' + r.from);
          out = out.replaceAll(r.from, r.to);
        }
        if (out === value) throw Error('replacement did not change value');
        return out;
      };
      const changes = [];
      for (const s of spec) {
        const figure = candidate.figures.find(f => f.figureId === s.id);
        if (!figure) throw Error('figure missing ' + s.id);
        changes.push({target: 'figure', figureId: s.id, field: 'transcription', fromValue: figure.transcription, toValue: apply(figure.transcription, s.transcription), replacements: s.transcription, sourceEvidence: s.evidence, sourceCrop: s.crop});
        changes.push({target: 'figure', figureId: s.id, field: 'caption', fromValue: figure.caption, toValue: apply(figure.caption, s.caption), replacements: s.caption, sourceEvidence: s.evidence, sourceCrop: s.crop});
      }
      for (const change of changes) {
        const figure = candidate.figures.find(f => f.figureId === change.figureId);
        figure[change.field] = change.toValue;
      }
      for (const block of candidate.body.blocks) {
        if (block.type !== 'text' || !Array.isArray(block.inlineContent)) continue;
        let touched = false;
        for (const part of block.inlineContent) {
          if (part.type === 'figure') {
            const figure = candidate.figures.find(f => f.figureId === part.figureId);
            if (figure && part.text !== figure.caption) { part.text = figure.caption; touched = true; }
          }
        }
        if (touched) block.text = block.inlineContent.map(p => p.text).join('');
      }
      return changes;
    },
  },
];

for (const spec of PAGES) {
  const parentPath = `${PARENT_ROOT_REL}/candidates/nemata-jp/page-${String(spec.page).padStart(4, '0')}.json`;
  const parentBytes = await readFile(abs(parentPath));
  const parentSha256 = sha(parentBytes);
  const parent = JSON.parse(parentBytes.toString('utf8'));
  const candidate = structuredClone(parent);
  const changes = spec.build(candidate);

  const notesBytes = await readFile(abs(spec.parentAudit));
  const raw = JSON.parse(await readFile(abs(`${PARENT_ROOT_REL}/raw-calls/${spec.callId}.json`), 'utf8'));
  const rawBytes = await readFile(abs(`${PARENT_ROOT_REL}/raw-calls/${spec.callId}.json`));
  const sourcePagePath = `nemata-jp/pages/${spec.page}.json`;
  const sourcePageBytes = await readFile(abs(sourcePagePath));

  const candidatePath = `${spec.root}/candidates/nemata-jp/page-${String(spec.page).padStart(4, '0')}.json`;
  Object.assign(candidate.provenance, {
    sourceFieldCorrection: {
      schema: 'coach-native-inline-field-correction/1',
      sourceId: 'nemata-jp',
      page: spec.page,
      parentPath,
      parentSha256,
      notesPath: spec.parentAudit,
      notesSha256: sha(notesBytes),
      originalProductionRaw: {path: `${PARENT_ROOT_REL}/raw-calls/${spec.callId}.json`, sha256: sha(rawBytes)},
      sourcePageDataSha256: sha(sourcePageBytes),
      newProductionModelCalls: 0,
      changes,
    },
  });
  const withoutDigest = {...candidate};
  delete withoutDigest.candidateSha256;
  candidate.candidateSha256 = sha(JSON.stringify(withoutDigest));
  await writeJson(candidatePath, candidate);
  const candidateBytes = await readFile(abs(candidatePath));
  const candidateSha256 = sha(candidateBytes);

  const n = candidate.provenance.sourceFieldCorrection;
  const proofPath = `audit/source-corrections/proofs/native-inline-p${spec.page}.${candidateSha256}.json`;
  const proof = {
    schema: 'coach-native-inline-field-correction-proof/1',
    candidateSha256,
    parentSha256,
    parentPath,
    originalAudit: {path: spec.parentAudit, sha256: sha(notesBytes), status: 'needs-repair'},
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
      scope: `Only audit-located, source-image-backed field changes on nemata-jp page ${spec.page}; original production raw, parent candidate and failed audit retained. No new production call.`,
    },
    jobs: [{
      schema: 'coach-native-inline-field-correction-job/1',
      sourceId: 'nemata-jp',
      page: spec.page,
      candidatePath,
      candidateSha256,
      parentPath,
      parentSha256,
      originalAuditPath: spec.parentAudit,
      originalAuditSha256: sha(notesBytes),
      originalProductionRaw: n.originalProductionRaw,
      sourcePagePath,
      sourcePageDataSha256: n.sourcePageDataSha256,
      proofPath,
      proofSha256,
      changes,
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
  await copyFile(abs(`${PARENT_ROOT_REL}/renders/nemata-jp/page-${String(spec.page).padStart(4, '0')}.png`), abs(`${spec.root}/renders/nemata-jp/page-${String(spec.page).padStart(4, '0')}.png`));

  console.log(JSON.stringify({
    page: spec.page, candidatePath, candidateSha256, parentSha256, proofPath, proofSha256, approvalPath, approvalSha256,
  }, null, 1));
}
