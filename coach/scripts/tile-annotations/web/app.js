const $ = id => document.getElementById(id);
let state, list = [], index = 0, dirty = false, version = 0, saving = false, timer;
let imagePoint = [.5, .5];
const labels = { answered: '可以确认', unclear: '看不清', missing: '原图缺失', skipped: '跳过', withdrawn: '已撤回' };
const item = () => list[index];
const record = id => state.annotations[id];
const processed = id => ['answered', 'unclear', 'missing'].includes(record(id)?.result.status);
const text = (id, value) => { $(id).textContent = value ?? ''; };
function status(message, invalid = false) { text('saveState', message); $('saveState').classList.toggle('invalid', invalid); }
async function request(url, options) {
  const response = await fetch(url, options), value = await response.json();
  if (!response.ok) throw new Error(value.error ?? `请求失败 ${response.status}`);
  return value;
}
function progress() {
  const q = state.queue.items, done = q.filter(x => processed(x.id)).length;
  text('progress', `共 ${q.length} 条（阻塞 ${q.filter(x=>x.blocking).length} / 非阻塞 ${q.filter(x=>!x.blocking).length}） · 已处理 ${done} · 剩余 ${q.length-done}`);
  if (state.queue.defaultBatch) {
    const batch = q.filter(x=>x.batchId===state.queue.defaultBatch);
    text('progress', $('progress').textContent + ` · 第二批 ${batch.length} 条，待核对 ${batch.filter(x=>!processed(x.id)).length}`);
  }
}
function filtered() {
  const mode = $('filter').value;
  return state.queue.items.filter(x => mode === 'all' || mode === 'batch' && x.batchId === state.queue.defaultBatch || mode === 'blocking' && x.blocking || mode === 'nonblocking' && !x.blocking || mode === 'todo' && !processed(x.id) || mode === 'answered' && processed(x.id));
}
function rebuild(keepId) {
  list = filtered(); index = Math.max(0, list.findIndex(x => x.id === keepId));
  $('jump').replaceChildren(...list.map((x,i) => { const o = document.createElement('option'); o.value = x.id; o.textContent = `${i+1}. ${x.blocking?'阻塞':'非阻塞'} · ${x.canonical} · ${x.prompt ?? x.position}`; return o; }));
  render();
}
function imageSize() {
  const image = $('overview'), detail = $('detailImage');
  if (!image.naturalWidth) return;
  const scale = Number($('zoom').value);
  detail.style.width = image.naturalWidth * scale + 'px'; detail.style.height = image.naturalHeight * scale + 'px';
  const viewport = $('zoomViewport');
  viewport.scrollLeft = imagePoint[0]*image.naturalWidth*scale - viewport.clientWidth/2;
  viewport.scrollTop = imagePoint[1]*image.naturalHeight*scale - viewport.clientHeight/2;
  const box = $('box'), bbox = item()?.bbox;
  box.replaceChildren(); box.toggleAttribute('hidden', !bbox);
  if (bbox) {
    box.style.width = image.clientWidth + 'px'; box.style.height = image.clientHeight + 'px';
    const frame = $('scene'), bounds = frame.getBoundingClientRect(), imageBounds = image.getBoundingClientRect();
    box.style.left = (imageBounds.left-bounds.left-frame.clientLeft) + 'px'; box.style.top = (imageBounds.top-bounds.top-frame.clientTop) + 'px';
    box.setAttribute('viewBox', `0 0 ${image.naturalWidth} ${image.naturalHeight}`);
    const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    rect.setAttribute('stroke','#d32e24'); rect.setAttribute('fill','none');
    for (const [key,val] of Object.entries({x:bbox[0],y:bbox[1],width:bbox[2]-bbox[0],height:bbox[3]-bbox[1]})) rect.setAttribute(key,val);
    box.append(rect);
  }
}
function render() {
  clearTimeout(timer); dirty = false; version++;
  const current = item(); progress();
  $('workspace').hidden = !current; $('empty').hidden = !!current;
  if (!current) return;
  $('jump').value = current.id;
  const saved = record(current.id);
  text('admission', current.admission); $('admission').classList.toggle('nonblocking', !current.blocking);
  text('entryTitle', current.batchLabel ?? current.book); text('chapter', `${current.chapter} · ${current.page ? `章起始页 / PDF 页 ${current.page}` : '网页来源'} · ${current.canonical}`);
  text('position', current.prompt ?? current.position);
  text('coordinates', current.bbox ? '红框来自源记录中的原嵌图像素坐标。' : current.regionBBox ? `PDF 图区域坐标：${current.regionBBox.map(x=>Math.round(x*100)/100).join(', ')}。单牌用文字定位。` : '此靶点没有单牌坐标，请按文字定位。');
  const imageURL = '/image/' + current.id;
  text('locationHelp','单击原图中的位置，放大视图将滚动到该处。没有单牌坐标时仅提供文字定位。');
  imagePoint = [.5,.5]; $('overview').hidden = false;
  $('overview').src = imageURL; $('detailImage').src = imageURL; $('original').href = imageURL;
  $('targetCrop').hidden = !current.cropImagePath;
  if (current.cropImagePath) $('cropImage').src = '/crop/' + current.id;
  else $('cropImage').removeAttribute('src');
  text('context', current.context || '此图没有相邻文字记录，请按图内场景标注。');
  text('machineText', JSON.stringify(current.machine, null, 2)); $('machine').open = false;
  text('source', `靶点：${current.targetId}\n图 SHA256：${current.imageSha256}\n${JSON.stringify(current.evidence, null, 2)}`);
  text('dataPath', `文件保存：${state.dataDir}/events.jsonl`);
  const result = saved?.result;
  $('status').value = result && result.status !== 'withdrawn' ? result.status : 'answered';
  $('tiles').value = result?.status === 'answered' ? result.tiles.join(' ') : '';
  $('orientation').value = result?.status === 'answered' ? result.orientation : '';
  $('note').value = result?.status !== 'withdrawn' ? result?.note ?? '' : '';
  updateHistory(); $('history').open = false;
  $('previous').disabled = index === 0;
  status(saved ? `已保存 · ${new Date(saved.timestamp).toLocaleString()} · ${labels[saved.result.status]}` : '有效输入会自动保存到本机文件。');
  updateFields();
  localStorage.setItem('coach-label-current', current.id);
}
function updateFields() { const disabled = $('status').value !== 'answered'; $('tiles').disabled = disabled; $('orientation').disabled = disabled; }
function updateHistory() {
  const events = state.events?.filter(x=>x.id===item().id) ?? [];
  $('historyList').replaceChildren(...events.slice().reverse().map(event => { const p = document.createElement('p'); p.textContent = `${new Date(event.timestamp).toLocaleString()} · ${labels[event.result.status]} · ${event.result.tiles.join(' ')} ${event.result.orientation} ${event.result.note}`; return p; }));
  $('withdraw').disabled = !record(item().id) || record(item().id).result.status === 'withdrawn';
}
function result() { return { status: $('status').value, tiles: $('tiles').value, orientation: $('orientation').value, note: $('note').value }; }
function payloadValid(value) { return value.status !== 'answered' || value.tiles.trim() || value.orientation.trim(); }
async function save(withdraw = false) {
  clearTimeout(timer);
  if (saving) { status('正在保存，请稍候再操作。'); return false; }
  const value = withdraw ? { status: 'withdrawn', tiles:'', orientation:'', note:'' } : result();
  if (!payloadValid(value)) { status('请填写牌码或方位，或选择“看不清 / 原图缺失 / 跳过”。', true); return false; }
  if (value.status !== 'answered') { value.tiles = ''; value.orientation = ''; }
  const current = item(), v = version;
  saving = true; $('saveNext').disabled = true; status('正在写入本机文件…');
  try {
    const event = await request('/api/annotations', { method:'POST', headers:{'Content-Type':'application/json','X-Annotation-Token':state.token}, body:JSON.stringify({id:current.id,imageSha256:current.imageSha256,expectedRevision:record(current.id)?.revision??0,result:value}) });
    state.annotations[current.id] = event; state.events.push(event);
    if (version === v) dirty = false;
    status(`已保存 · ${new Date(event.timestamp).toLocaleTimeString()}`); progress(); updateHistory();
    if (withdraw) render();
    return !dirty;
  } catch (error) { status(`未保存：${error.message}`, true); return false; }
  finally { saving = false; $('saveNext').disabled = false; if(dirty && version !== v) timer = setTimeout(()=>save(),900); }
}
function changed() {
  dirty = true; version++; updateFields(); clearTimeout(timer);
  status('尚未保存…');
  if (payloadValid(result())) timer = setTimeout(()=>save(),900);
}
async function leave() {
  if (saving) { status('正在保存，请稍候再操作。'); return false; }
  if (!dirty) return true;
  if (await save()) return true;
  return confirm('当前输入尚未保存。要离开并放弃这些未保存的输入吗？');
}
async function move(delta, saveFirst = false) {
  if (saveFirst ? !await save() : !await leave()) return;
  if (index + delta >= list.length) { status('已到当前队列最后一条。可切换范围或继续修改。'); return; }
  index = Math.max(0,index+delta); render();
}
$('form').addEventListener('input',changed);
$('form').addEventListener('change',event=>{ if(event.target.id==='status') { if($('status').value!=='answered'){$('tiles').value='';$('orientation').value='';} changed(); } });
$('form').addEventListener('submit',event=>{event.preventDefault();move(1,true);});
$('previous').onclick = ()=>move(-1);
$('jump').onchange = async()=>{ const id=$('jump').value; if(await leave()){index=list.findIndex(x=>x.id===id);render();}else $('jump').value=item().id; };
let oldFilter='all'; $('filter').onchange=async()=>{ if(await leave()){oldFilter=$('filter').value;rebuild(item()?.id);}else $('filter').value=oldFilter; };
$('withdraw').onclick=()=>save(true);
$('overview').onload = () => {
  const bbox = item()?.bbox, image = $('overview');
  if (bbox) imagePoint = [(bbox[0]+bbox[2])/(2*image.naturalWidth),(bbox[1]+bbox[3])/(2*image.naturalHeight)];
  imageSize();
};
$('overview').onerror=()=>{ $('box').setAttribute('hidden',''); text('locationHelp','原图无法打开，请保留当前靶点并选择“原图缺失”，或刷新后重试。'); };
$('overview').onclick=event=>{ const rect=event.target.getBoundingClientRect();imagePoint=[(event.clientX-rect.left)/rect.width,(event.clientY-rect.top)/rect.height];imageSize(); };
$('overview').onkeydown=event=>{if(event.key==='Enter'){imageSize();$('zoomViewport').focus();}};
$('zoom').onchange=imageSize;$('center').onclick=()=>{imagePoint=[.5,.5];imageSize();};window.addEventListener('resize',imageSize);
new ResizeObserver(imageSize).observe($('overview'));
document.addEventListener('keydown',event=>{if(event.ctrlKey&&event.key==='Enter'){event.preventDefault();move(1,true);}else if(event.altKey&&['ArrowLeft','ArrowRight'].includes(event.key)){event.preventDefault();move(event.key==='ArrowLeft'?-1:1);}});
window.addEventListener('beforeunload',event=>{if(dirty||saving){event.preventDefault();event.returnValue='';}});
(async()=>{try{state=await request('/api/state');const history=await request('/api/export');state.events=history.events;if(state.queue.defaultBatch){$('batchFilter').hidden=false;$('filter').value='batch';oldFilter='batch';}rebuild(localStorage.getItem('coach-label-current'));}catch(error){$('error').hidden=false;text('error',`加载失败：${error.message}。请检查服务日志后刷新。`);}})();
