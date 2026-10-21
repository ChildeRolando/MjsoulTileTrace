import { fetchJson } from './network.mjs';

export const SOURCES = [
  { id: 'nikke-majsoul', priority: 0, dataset: 'nikketryhard/tenhou-houou-mjai', match: /^majsoul.*\.tar$/, platform: 'mahjong_soul', formats: ['tar/mjai/zstd'], note: '雀魂玉间、王座间年度分片；保留分片和文件名元数据。' },
  { id: 'hhim-tenhou', priority: 0, dataset: 'hhim8826/tenhou-houou-mjai', match: /\.parquet$/, platform: 'tenhou', formats: ['parquet/mjai'], note: '天凤整库分片；上游已移除日期、段位和原始 ID，保持未知，不补猜。天凤上游使用条款仍适用。' },
  { id: 'nikke-tenhou', priority: 0, dataset: 'nikketryhard/tenhou-houou-mjai', match: /^tenhou-houou.*\.tar$/, platform: 'tenhou', formats: ['tar/mjai/zstd'], note: '天凤年度分片，日期从文件名按小时精度保存；上游使用条款仍适用。' },
  { id: 'tenhou-live', priority: 2, platform: 'tenhou', url: 'https://tenhou.net/sc/raw/', formats: ['gzip-index/xml'], note: '官方公开索引；单会话，至少 20 分钟刷新；应用到一般麻将须向上游确认用途。' },
  { id: 'amae-koromo', available: false, platform: 'mahjong_soul', url: 'https://amae-koromo.sapk.ch/', note: '公开对局/段位索引不是完整牌谱数据集；完整历史优先上述分片。未接入需要账号的牌谱抓取。' },
  { id: 'riichi-city', available: false, platform: 'riichi_city', url: 'https://www.mahjong-jp.com/', note: '尚未核实可公开枚举的整库或批量接口；可导入已公开导出的四人 MJAI 文件/数据集。' },
  { id: 'other-mjai', available: true, priority: 0, note: '其他公开 MJAI 数据集、镜像或文件清单：通过 manifest/local import；不冒充已核实的平台专用爬虫。' },
];

export async function discoverHuggingFace(source) {
  const info = (await fetchJson(`https://huggingface.co/api/datasets/${source.dataset}`)).data;
  if (!/^[a-f0-9]{40}$/.test(info.sha)) throw new Error('dataset_revision_missing');
  const jobs = [];
  let url = `https://huggingface.co/api/datasets/${source.dataset}/tree/${info.sha}?recursive=true&limit=100`;
  const pages = new Set();
  while (url) {
    if (pages.has(url) || pages.size >= 100) throw new Error('dataset_pagination_invalid');
    pages.add(url);
    const { data, link } = await fetchJson(url);
    if (!Array.isArray(data)) throw new Error('dataset_tree_invalid');
    for (const f of data) if (f.type === 'file' && source.match.test(f.path)) {
      jobs.push({ source: source.id, platform: source.platform, priority: 0, name: f.path, size: f.size,
        revision: info.sha, sha256: f.lfs?.oid,
        url: `https://huggingface.co/datasets/${source.dataset}/resolve/${info.sha}/${f.path.split('/').map(encodeURIComponent).join('/')}`,
        metadata: { platform: source.platform, dataset: source.dataset, revision: info.sha, shard: f.path,
          ...(f.path.includes('jade') ? { room: 'jade' } : f.path.includes('throne') ? { room: 'throne' } : {}) } });
    }
    url = /<([^>]+)>;\s*rel="next"/.exec(link ?? '')?.[1] ?? null;
    if (url && !url.startsWith(`https://huggingface.co/api/datasets/${source.dataset}/tree/`)) throw new Error('dataset_pagination_origin_changed');
  }
  if (!jobs.length) throw new Error(`dataset_no_supported_shards:${source.id}`);
  return jobs.sort((a, b) => a.size - b.size || a.name.localeCompare(b.name));
}

export function orderJobs(jobs) {
  return jobs.map((j, index) => ({ ...j, index })).sort((a, b) => (a.priority ?? 0) - (b.priority ?? 0) || a.index - b.index);
}
