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
const groups: Record<string,string[]> = {
  '场况与规则': ['selfActor','windowKind','ruleSet','roundWind','hand','honba','riichiSticks','dealer','scores','seatWinds','remainingDraws','doraIndicators'],
  '自己手牌及当前摸牌': ['self'],
  '四家公开牌河副露及立直': ['rivers','melds','riichiStates'],
  '完整事件与引用顺序': ['visibleHistory','eventOrder'],
};
const keysEqual = (actual: string[],expected: string[]) => JSON.stringify(actual) === JSON.stringify(expected);
export function encodePublicTable(input: unknown): unknown {
  const root=object(input), raw=object(root.raw);
  if (!keysEqual(Object.keys(root),['raw','caseRef','legalCandidates']) || !keysEqual(Object.keys(raw),rawOrder)) throw new Error('public_table_unsupported_layout');
  return { ...Object.fromEntries(Object.entries(groups).map(([label,keys]) => [label,translate(Object.fromEntries(keys.map(key=>[key,raw[key]])),false)])),
    '局面引用':root.caseRef, '全部合法候选':translate(root.legalCandidates,false) };
}
export function decodePublicTable(input: unknown): unknown {
  const root=object(input); if (!keysEqual(Object.keys(root),[...Object.keys(groups),'局面引用','全部合法候选'])) throw new Error('public_table_unsupported_sections');
  const parts: Record<string,unknown> = {};
  for (const [label,keys] of Object.entries(groups)) { const part=object(translate(root[label],true)); if (!keysEqual(Object.keys(part),keys)) throw new Error('public_table_unsupported_fields'); Object.assign(parts,part); }
  return { raw:Object.fromEntries(rawOrder.map(key=>[key,parts[key]])), caseRef:root['局面引用'], legalCandidates:translate(root['全部合法候选'],true) };
}
