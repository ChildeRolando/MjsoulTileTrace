import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { createHash, randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';

export const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
export const readJson = file => JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, ''));
const webDir = path.join(path.dirname(fileURLToPath(import.meta.url)), 'web');
const honors = { 东: '1z', 東: '1z', 南: '2z', 西: '3z', 北: '4z', 白: '5z', 发: '6z', 發: '6z', 中: '7z' };
const statuses = ['answered', 'unclear', 'missing', 'skipped', 'withdrawn'];
const fail = (message, status = 400) => Object.assign(new Error(message), { status });

export function validateResult(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).some(k => !['status', 'tiles', 'orientation', 'note'].includes(k))) throw fail('标注格式无效');
  if (!statuses.includes(value.status)) throw fail('请选择标注状态');
  for (const key of ['tiles', 'orientation', 'note']) if (typeof value[key] !== 'string' || value[key].length > 4000) throw fail('字段格式或长度无效');
  const tokens = value.tiles.trim() ? value.tiles.trim().split(/[\s,，、;；]+/) : [];
  const tiles = tokens.map(token => {
    const code = honors[token] ?? token.replace(/^赤5([mps])$/, '0$1');
    if (!/^(?:[1-9][mps]|[1-7]z|0[mps])$/.test(code)) throw fail(`无法识别牌码「${token}」。请逐张填写，例如 1m 5p 赤5s 东。`);
    return code;
  });
  if (value.status === 'answered' && !tiles.length && !value.orientation.trim()) throw fail('请填写牌码或明确方位');
  if (value.status !== 'answered' && (tiles.length || value.orientation.trim())) throw fail('非明确标注状态请清空牌码和方位，补充说明可写在备注');
  return { status: value.status, tiles, orientation: value.orientation.trim(), note: value.note.trim() };
}

// Resolve both lexical paths and symlinks/junctions within the read-only source root.
export function within(root, relative) {
  if (typeof relative !== 'string' || !relative) throw fail('image path missing');
  const base = fs.realpathSync(root), target = path.resolve(base, relative);
  const inside = candidate => { const rel = path.relative(base, candidate); return rel !== '..' && !rel.startsWith('..' + path.sep) && !path.isAbsolute(rel); };
  if (!inside(target)) throw fail('image path outside processing root');
  if (fs.existsSync(target) && !inside(fs.realpathSync(target))) throw fail('image symlink outside processing root');
  return target;
}

export function readAnnotations(dataDir, queue) {
  const file = path.join(dataDir, 'events.jsonl');
  const events = fs.existsSync(file) ? fs.readFileSync(file, 'utf8').split('\n').filter(Boolean).map(line => JSON.parse(line)) : [];
  const annotations = Object.create(null);
  const targets = new Map(queue.items.map(item => [item.id, item]));
  for (const event of events) {
    const item = targets.get(event.id);
    if (item && event.imageSha256 === item.imageSha256 && event.targetId === item.targetId && event.canonical === item.canonical) annotations[event.id] = event;
  }
  return { events, annotations };
}

export async function startServer({ root, queuePath, dataDir, port = 8765 }) {
  root = fs.realpathSync(root); dataDir = path.resolve(dataDir);
  if (dataDir === root || dataDir.startsWith(root + path.sep)) throw fail('标注目录必须独立于只读 processing 目录');
  const queueBytes = fs.readFileSync(queuePath), queue = JSON.parse(queueBytes.toString('utf8').replace(/^\uFEFF/, ''));
  if (queue.schema !== 'coach-tile-annotation-queue/1' || !Array.isArray(queue.items)) throw fail('队列格式无效');
  const ids = new Set();
  for (const item of queue.items) {
    if (!/^[a-zA-Z0-9_-]+$/.test(item.id) || ids.has(item.id) || !/^[a-f0-9]{64}$/.test(item.imageSha256)) throw fail('队列靶点身份无效或重复');
    ids.add(item.id);
    if (item.imagePath) within(root, item.imagePath);
    if (item.cropImagePath) {
      within(root, item.cropImagePath);
      if (!/^[a-f0-9]{64}$/.test(item.cropImageSha256)) throw fail('裁剪图片SHA无效');
    }
  }
  fs.mkdirSync(dataDir, { recursive: true });
  const token = randomBytes(32).toString('hex'), queueSha256 = sha256(queueBytes);
  const lockPath = path.join(dataDir, 'server.lock');
  if (fs.existsSync(lockPath)) {
    const lock = readJson(lockPath);
    try { process.kill(lock.pid, 0); throw fail(`标注目录已有服务占用，PID ${lock.pid}`); }
    catch (error) { if (error.code !== 'ESRCH') throw error; }
    fs.unlinkSync(lockPath);
  }
  fs.writeFileSync(lockPath, JSON.stringify({ pid: process.pid, token }), { flag: 'wx' });
  let state;
  try { state = readAnnotations(dataDir, queue); }
  catch (error) { fs.unlinkSync(lockPath); throw fail('历史文件损坏；请保留 events.jsonl 并检查最后一行：' + error.message); }
  const items = new Map(queue.items.map(item => [item.id, item]));
  const checkedImage = item => {
    if (!item.imagePath) throw fail('原图缺失，可选择“原图缺失”保存', 404);
    const file = within(root, item.imagePath);
    if (!fs.existsSync(file)) throw fail('原图文件缺失', 404);
    const bytes = fs.readFileSync(file);
    if (sha256(bytes) !== item.imageSha256) throw fail('原图SHA不匹配，请重新生成队列后重启', 409);
    return { file, bytes };
  };
  const server = http.createServer(async (req, res) => {
    const send = (status, value, type = 'application/json; charset=utf-8') => {
      res.writeHead(status, { 'Content-Type': type, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer', 'Content-Security-Policy': "default-src 'self'; img-src 'self'; script-src 'self'; style-src 'self'; object-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'" });
      res.end(Buffer.isBuffer(value) || typeof value === 'string' ? value : JSON.stringify(value));
    };
    try {
      const authority = `127.0.0.1:${server.address().port}`;
      if (req.headers.host !== authority || (req.headers.origin && req.headers.origin !== `http://${authority}`)) throw fail('仅允许本机页面访问', 403);
      const url = new URL(req.url, `http://${authority}`);
      if (url.search || url.hash) throw fail('不接受查询路径', 404);
      if (req.method === 'GET' && url.pathname === '/api/state') return send(200, { queue, annotations: state.annotations, token, dataDir });
      if (req.method === 'GET' && url.pathname === '/api/export') {
        res.setHeader('Content-Disposition', 'attachment; filename="human-annotations.json"');
        return send(200, { schema: 'coach-human-tile-annotations/1', exportedAt: new Date().toISOString(), queueSha256, queue, events: state.events });
      }
      if (req.method === 'GET' && (url.pathname.startsWith('/image/') || url.pathname.startsWith('/crop/'))) {
        const isCrop = url.pathname.startsWith('/crop/');
        const item = items.get(url.pathname.slice(isCrop ? 6 : 7));
        if (!item) throw fail('图片靶点不存在', 404);
        let { file, bytes } = checkedImage(item);
        if (isCrop) {
          if (!item.cropImagePath) throw fail('此靶点没有原像素裁剪', 404);
          file = within(root, item.cropImagePath); bytes = fs.readFileSync(file);
          if (sha256(bytes) !== item.cropImageSha256) throw fail('裁剪图片SHA不匹配', 409);
        }
        const type = ({ '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp' })[path.extname(file).toLowerCase()];
        if (!type) throw fail('图片类型不支持');
        return send(200, bytes, type);
      }
      if (req.method === 'POST' && url.pathname === '/api/annotations') {
        if (req.headers['x-annotation-token'] !== token || !req.headers['content-type']?.startsWith('application/json')) throw fail('保存请求校验失败，请刷新页面', 403);
        let bytes = 0, chunks = [];
        for await (const chunk of req) { bytes += chunk.length; if (bytes > 32768) throw fail('保存内容过长', 413); chunks.push(chunk); }
        const body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
        const item = items.get(body.id);
        if (!item) throw fail('靶点不存在', 404);
        if (body.imageSha256 !== item.imageSha256) throw fail('图片与靶点不匹配', 409);
        const current = state.annotations[item.id]?.revision ?? 0;
        if (body.expectedRevision !== current) throw fail('此条已在其他页面修改，请刷新后再保存', 409);
        const result = validateResult(body.result);
        if (result.status !== 'missing' && item.imagePath) checkedImage(item);
        const event = { schema: 'coach-human-tile-annotation-event/1', id: item.id, targetId: item.targetId, imageSha256: item.imageSha256, originalImages: item.originalImages ?? [], canonical: item.canonical, position: item.position, queueSha256, revision: current + 1, result, timestamp: new Date().toISOString() };
        const fd = fs.openSync(path.join(dataDir, 'events.jsonl'), 'a');
        try { fs.writeSync(fd, JSON.stringify(event) + '\n'); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
        state.events.push(event); state.annotations[item.id] = event;
        return send(200, event);
      }
      const assets = { '/': ['index.html', 'text/html; charset=utf-8'], '/app.js': ['app.js', 'text/javascript; charset=utf-8'], '/style.css': ['style.css', 'text/css; charset=utf-8'] };
      if (req.method === 'GET' && assets[url.pathname]) { const [file, type] = assets[url.pathname]; return send(200, fs.readFileSync(path.join(webDir, file)), type); }
      throw fail('页面不存在', 404);
    } catch (error) { send(error.status ?? 400, { error: error.message }); }
  });
  const unlock = () => { if (fs.existsSync(lockPath) && readJson(lockPath).token === token) fs.unlinkSync(lockPath); };
  try { await new Promise((resolve, reject) => { server.once('error', reject); server.listen(port, '127.0.0.1', resolve); }); }
  catch (error) { unlock(); throw error; }
  return { server, close: () => new Promise(resolve => { server.close(() => { unlock(); resolve(); }); server.closeIdleConnections(); }) };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2), option = (name, fallback) => { const i = args.indexOf(name); return i < 0 ? fallback : args[i + 1]; };
  const app = await startServer({ root: option('--root', 'E:/AgentData/Coach/knowledge/processing'), queuePath: option('--queue', 'E:/AgentData/Coach/knowledge/human-annotations/queue.json'), dataDir: option('--data', 'E:/AgentData/Coach/knowledge/human-annotations'), port: Number(option('--port', '8765')) });
  console.log(`牌面人工标注：http://127.0.0.1:${app.server.address().port}/ PID=${process.pid}`);
  for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, async () => { await app.close(); process.exit(0); });
}
