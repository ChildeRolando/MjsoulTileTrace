/** Reversible presentation of the already projected, public Arena input. */
const labels: Record<string,string> = {
  raw:'公开局面',caseRef:'局面引用',legalCandidates:'合法候选',selfActor:'自己座位',windowKind:'决策窗口',ruleSet:'规则',visibleHistory:'完整事件',eventOrder:'事件引用顺序',roundWind:'场风',hand:'局数',honba:'本场',riichiSticks:'供托',dealer:'庄家',scores:'四家点数',seatWinds:'四家座风',remainingDraws:'剩余摸牌数',doraIndicators:'宝牌指示牌',rivers:'四家牌河',melds:'公开副露',riichiStates:'四家立直状态',self:'自身手牌',
  length:'场次长度',redFives:'赤五数量',man:'万',pin:'筒',sou:'索',openTanyao:'食断',atamahane:'头跳',westExtension:'西入',ippatsuCancelledByAnkan:'暗杠取消一发',
  eventRef:'事件引用',type:'事件类型',actor:'座位',tile:'牌',from:'来源',discardMode:'切牌方式',declarationRef:'宣言引用',calledDiscardRef:'被鸣舍牌引用',calledTile:'被鸣牌',consumedTiles:'使用手牌',targetActor:'目标座位',tiles:'牌组',addedTile:'加杠牌',upgradedPonRef:'原碰引用',indicator:'指示牌',kanRef:'杠引用',
  id:'牌代码',red:'赤牌',sourceRef:'来源引用',riichiDeclarationRef:'立直宣言引用',calledByRef:'鸣牌引用',kind:'副露类型',meldRef:'副露引用',createdEventRef:'创建事件引用',latestEventRef:'最新事件引用',calledDiscardEventRef:'被鸣舍牌事件引用',upgradedPonEventRef:'原碰事件引用',status:'状态',declarationEventRef:'宣言事件引用',acceptanceEventRef:'成立事件引用',concealedTiles:'手牌不含摸牌',currentDraw:'当前摸牌',actionRef:'行动引用',
};
const encodedKey = (key: string) => `${labels[key]}（${key}）`;
const reverse = new Map(Object.keys(labels).map(key => [encodedKey(key),key]));
const object = (v: unknown): Record<string,unknown> => { if (!v || typeof v !== 'object' || Array.isArray(v)) throw new Error('public_table_object_required'); return v as Record<string,unknown>; };
function translate(value: unknown, decode: boolean): unknown {
  if (Array.isArray(value)) return value.map(x => translate(x,decode));
  if (value === null || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(object(value)).map(([key,v]) => {
    const name = decode ? reverse.get(key) : (Object.hasOwn(labels,key) ? encodedKey(key) : undefined);
    if (name === undefined) throw new Error(`public_table_unsupported_field:${key}`);
    return [name,translate(v,decode)];
  }));
}
const rawOrder = ['selfActor','windowKind','ruleSet','visibleHistory','eventOrder','roundWind','hand','honba','riichiSticks','dealer','scores','seatWinds','remainingDraws','doraIndicators','rivers','melds','riichiStates','self'];
const general = ['selfActor','windowKind','ruleSet','roundWind','hand','honba','riichiSticks','dealer','scores','seatWinds','remainingDraws','doraIndicators'];
const keysEqual = (actual: string[],expected: string[]) => JSON.stringify(actual) === JSON.stringify(expected);
const array = (v: unknown): unknown[] => { if (!Array.isArray(v)) throw new Error('public_table_array_required'); return v; };
const cell = (v: unknown) => JSON.stringify(translate(v,false)).replaceAll('\\','\\\\').replaceAll('|','\\|');
function cells(line: string): string[] {
  if (!line.startsWith('|') || !line.endsWith('|')) throw new Error('public_table_row_invalid');
  const out: string[] = []; let text=''; let escaped=false;
  for (const ch of line.slice(1,-1)) { if (escaped) { if (ch !== '|' && ch !== '\\') throw new Error('public_table_escape_invalid'); text+=ch; escaped=false; } else if (ch==='\\') escaped=true; else if (ch==='|') { out.push(text.trim()); text=''; } else text+=ch; }
  if (escaped) throw new Error('public_table_escape_invalid'); out.push(text.trim()); return out;
}
const row = (...v: string[]) => `| ${v.join(' | ')} |`;
const value = (v: string) => translate(JSON.parse(v),true);
const heading = (title: string, columns: string[]) => [`## ${title}`,row(...columns),row(...columns.map(()=> '---'))];
export function encodePublicTable(input: unknown): string {
  const root=object(input), raw=object(root.raw), self=object(raw.self), rivers=array(raw.rivers), riichi=array(raw.riichiStates), melds=array(raw.melds), events=array(raw.visibleHistory), order=array(raw.eventOrder), candidates=array(root.legalCandidates);
  if (!keysEqual(Object.keys(root),['raw','caseRef','legalCandidates']) || !keysEqual(Object.keys(raw),rawOrder) || !keysEqual(Object.keys(self),['concealedTiles','currentDraw']) || rivers.length!==4 || riichi.length!==4) throw new Error('public_table_unsupported_layout');
  const lines=[...heading('场况与规则',['字段','值']),...general.map(k=>row(encodedKey(k),cell(raw[k]))),row(encodedKey('caseRef'),cell(root.caseRef)),
    ...heading('自己手牌与摸牌',['字段','值']),row(encodedKey('concealedTiles'),cell(self.concealedTiles)),row(encodedKey('currentDraw'),cell(self.currentDraw)),
    ...heading('四家公开状态',['座位顺序','牌河（从早到晚）','立直状态']),...rivers.map((v,i)=>row(String(i),cell(v),cell(riichi[i]))),
    ...heading('公开副露',['顺序','副露']),...melds.map((v,i)=>row(String(i),cell(v))),
    ...heading('全部合法候选',['顺序','候选']),...candidates.map((v,i)=>row(String(i),cell(v))),
    ...heading('完整公开事件',['顺序','事件']),...events.map((v,i)=>row(String(i),cell(v))),
    ...heading('事件引用顺序',['顺序','引用']),...order.map((v,i)=>row(String(i),cell(v)))];
  return lines.join('\n');
}
export function decodePublicTable(input: unknown): unknown {
  if (typeof input !== 'string') throw new Error('public_table_text_required');
  const lines=input.split('\n'); let i=0;
  const section=(title:string,columns:string[])=>{ const expected=heading(title,columns); for(const line of expected) if(lines[i++]!==line)throw new Error('public_table_header_invalid'); };
  const next=(count:number)=>{ const v=cells(lines[i++] ?? ''); if(v.length!==count)throw new Error('public_table_column_invalid'); return v; };
  const pairs:Record<string,unknown>={};section('场况与规则',['字段','值']);for(const key of [...general,'caseRef']) {const r=next(2);if(r[0]!==encodedKey(key))throw new Error('public_table_field_order');pairs[key]=value(r[1]!);}
  section('自己手牌与摸牌',['字段','值']);const self:Record<string,unknown>={};for(const key of ['concealedTiles','currentDraw']){const r=next(2);if(r[0]!==encodedKey(key))throw new Error('public_table_field_order');self[key]=value(r[1]!);}
  section('四家公开状态',['座位顺序','牌河（从早到晚）','立直状态']);const rivers:unknown[]=[],riichiStates:unknown[]=[];for(let n=0;n<4;n++){const r=next(3);if(r[0]!==String(n))throw new Error('public_table_seat_order');rivers.push(value(r[1]!));riichiStates.push(value(r[2]!));}
  const indexed=(title:string,columns:string[])=>{section(title,columns);const out:unknown[]=[];while(i<lines.length&&!lines[i]!.startsWith('## ')){const r=next(2);if(r[0]!==String(out.length))throw new Error('public_table_row_order');out.push(value(r[1]!));}return out;};
  const melds=indexed('公开副露',['顺序','副露']),legalCandidates=indexed('全部合法候选',['顺序','候选']),visibleHistory=indexed('完整公开事件',['顺序','事件']),eventOrder=indexed('事件引用顺序',['顺序','引用']);
  const fields={...pairs,self,rivers,riichiStates,melds,visibleHistory,eventOrder};
  return {raw:Object.fromEntries(rawOrder.map(key=>[key,fields[key as keyof typeof fields]])),caseRef:pairs.caseRef,legalCandidates};
}
