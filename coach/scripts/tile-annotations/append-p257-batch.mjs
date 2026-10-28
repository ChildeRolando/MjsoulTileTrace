import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { sha256, readJson, within } from './server.mjs';

export const batchId = 'p257-old-transcription-v2';
const packetPath = 'integration/coac269-p257-twenty-check-v2-20261028/manifest.json';
const packetSha = '862165cc57520ad90b426a523850ef51cb1b235b0b90f1f54ea4c32649075c4a';
const protectedSlots = ['upper:1','upper:6','upper:17','left:16','right:1','right:2','right:7','right:13','right:14'];

// Explicit incremental import: preserve incumbent items; never write human events or
// rebuild the first batch from changing processing selections.
export function appendP257Batch(root, base, { manifestPath = packetPath, manifestSha256 = packetSha } = {}) {
  const inputs = new Map((base.inputs ?? []).map(i => [i.path, i.sha256]));
  const relative = file => path.relative(fs.realpathSync(root), file).replaceAll('\\', '/');
  const checked = ref => {
    const file = within(root, ref.path), bytes = fs.readFileSync(file);
    if (sha256(bytes) !== ref.sha256) throw new Error(`增量包SHA不匹配：${ref.path}`);
    inputs.set(relative(file), ref.sha256);
    return { file, bytes };
  };
  const load = ref => JSON.parse(checked(ref).bytes);
  const manifest = load({ path: manifestPath, sha256: manifestSha256 });
  const geometry = load(manifest.targets);
  if (geometry.schema !== 'coac269-p257-20-source-pixel-targets/1' || geometry.targetCount !== 20
    || geometry.targets?.length !== 20 || geometry.protectedHumanPositions?.length !== 9
    || new Set(geometry.protectedHumanPositions.map(p => `${p.scope}:${p.ordinal}`)).size !== 9
    || geometry.protectedHumanPositions.some(p => !protectedSlots.includes(`${p.scope}:${p.ordinal}`))) throw new Error('20靶或九个人标保护范围不匹配');
  for (const ref of manifest.files) checked(ref);
  const candidate = load(geometry.candidate); checked(geometry.parent);
  const figure = candidate.figures.find(f => f.figureId === 'nemata-jp-p257-r1');
  if (!figure?.sourceImageBlockIds?.includes('nemata-jp-p257-b4')) throw new Error('CPU结果图未绑定候选');
  const sourceRef = geometry.sourceImages['257-results'], source = checked(sourceRef);
  const pngSize = bytes => {
    if (!bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))) throw new Error('需要原始PNG');
    return [bytes.readUInt32BE(16), bytes.readUInt32BE(20)];
  };
  if (String(pngSize(source.bytes)) !== '2109,1210') throw new Error('原图尺寸不匹配');
  const positions = new Set(), ids = new Set(base.items.map(i => i.id));
  const extra = geometry.targets.map((target, n) => {
    const slot = `${target.scope}:${target.ordinal}`;
    if (target.id !== `T${String(n+1).padStart(2,'0')}` || positions.has(slot) || protectedSlots.includes(slot)
      || target.existingHumanItem !== false || target.newTile !== null
      || target.sourceImageBlockId !== 'nemata-jp-p257-b4'
      || target.sourceImage.sha256 !== sourceRef.sha256 || path.resolve(root,target.sourceImage.path) !== source.file) throw new Error('新增靶点与原人标/源图冲突');
    positions.add(slot);
    const b = target.targetBox, c = target.cropBox;
    if (![b,c].every(box => Array.isArray(box) && box.length === 4 && box.every(Number.isInteger))
      || !(0 <= c[0] && c[0] <= b[0] && b[0] < b[2] && b[2] <= c[2] && c[2] <= 2109
        && 0 <= c[1] && c[1] <= b[1] && b[1] < b[3] && b[3] <= c[3] && c[3] <= 1210)) throw new Error('原像素定位框无效');
    const crop = checked(target.crop);
    if (String(pngSize(crop.bytes)) !== `${c[2]-c[0]},${c[3]-c[1]}`) throw new Error('原像素裁剪尺寸不匹配');
    const raw = load(target.originalMachineEvidence);
    if (typeof raw.parsedOutput?.figures?.[0]?.transcription !== 'string') throw new Error('旧转录raw绑定缺失');
    const targetId = `${target.sourceImageBlockId}:old-transcription:${slot}`;
    const id = sha256(`${sourceRef.sha256}\n${targetId}`).slice(0,32);
    const item = { id, targetId, batchId, batchLabel: '第二批 · 第257页核对旧转录', packetTargetId: target.id,
      figureId: figure.figureId, canonical: 'nemata-jp-chapter-250-1', book: '现代麻雀技术论（Nemata）',
      chapter: '何切问题探讨1 · CPU参考结果', page: 257,
      position: `${target.regionLabel}第${target.ordinal}张；原图右侧CPU结果。${geometry.regions.find(r => r.id === target.scope)?.meaning ?? ''}`,
      prompt: `${target.id} · ${target.regionLabel}第${target.ordinal}张：请按红框确认牌码。`,
      blocking: true, admission: '核对旧转录；不修改或重复询问你上一轮的九个答案。', priority: -20+n,
      imagePath: relative(source.file), imageSha256: sourceRef.sha256, sourceBlockId: target.sourceImageBlockId,
      originalImages: [{ path: relative(source.file), sha256: sourceRef.sha256 }], bbox: b,
      cropImagePath: relative(crop.file), cropImageSha256: target.crop.sha256, cropBox: c,
      context: '完整原图左侧为“你”的结果，右侧为CPU结果；本批仅核对右侧旧机器转录。裁剪保持原像素，不推断牌码。\n'
        + candidate.body.blocks.filter(b => b.type === 'text').map(b => b.text ?? b.sourceText ?? '').join('\n'),
      machine: { transcription: { oldTile: target.oldTile }, issues: [target.suspicion], originalEvidence: target.originalMachineEvidence },
      evidence: [{ packetPath: relative(path.resolve(root, manifestPath)), packetSha256: manifestSha256,
        targetsSha256: manifest.targets.sha256, candidatePath: relative(path.resolve(root,geometry.candidate.path)),
        candidateSha256: geometry.candidate.sha256, sourceImageBlockId: target.sourceImageBlockId,
        scope: target.scope, ordinal: target.ordinal, targetBox: b, cropBox: c }] };
    const existing = base.items.find(i => i.id === id);
    if (ids.has(id) && (!existing || existing.batchId !== batchId || JSON.stringify(existing) !== JSON.stringify(item))) throw new Error('稳定ID冲突，拒绝覆盖');
    ids.add(id);
    return existing ?? item;
  });
  const extraIds = new Set(extra.map(i => i.id));
  const items = [...extra, ...base.items.filter(i => !extraIds.has(i.id))];
  return { ...base, generatedAt: new Date().toISOString(), defaultBatch: batchId,
    counts: { total: items.length, blocking: items.filter(i => i.blocking).length, nonblocking: items.filter(i => !i.blocking).length },
    inputs: [...inputs].map(([path, sha256]) => ({ path, sha256 })), items };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [root, basePath, output] = process.argv.slice(2);
  if (!root || !basePath || !output || path.resolve(basePath) === path.resolve(output)) throw new Error('指定processing、旧队列和独立新队列路径');
  const queue = appendP257Batch(root, readJson(basePath));
  fs.writeFileSync(output, JSON.stringify(queue, null, 2)+'\n', {flag:'wx'});
  console.log(JSON.stringify({output, counts:queue.counts, addedBatch:batchId, batchCount:20}));
}
