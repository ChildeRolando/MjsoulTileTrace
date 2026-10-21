import { createHash } from 'node:crypto';
import { tokenizeMjlog, decodeTenhouMeld, tenhouTileCode } from '@riichi-coach/tenhou-source';
import { formatMjaiTile, parseMjaiTile } from '@riichi-coach/mortal-source';

export const ID_VERSION = 'replay-content/v1';
export const sha256 = value => createHash('sha256').update(value).digest('hex');
const tileCache = new Map();
function tile(value) {
  if (!tileCache.has(value)) tileCache.set(value, formatMjaiTile(parseMjaiTile(value)));
  return tileCache.get(value);
}
function seat(n) {
  if (!Number.isInteger(n) || n < 0 || n > 3) throw new Error('invalid_four_player_seat');
  return n;
}
const ints = s => s.split(',').map(n => {
  if (!/^-?\d+$/.test(n)) throw new Error('invalid_integer');
  return Number(n);
});
function hand(a) {
  if (!Array.isArray(a) || a.length !== 13) throw new Error('incomplete_starting_hand');
  return a.map(tile).sort();
}
function scores(a) {
  if (!Array.isArray(a) || a.length !== 4 || !a.every(Number.isInteger)) throw new Error('invalid_scores');
  return a;
}

function parseMjaiDocument(raw) {
  const text = Buffer.isBuffer(raw) ? raw.toString('utf8') : raw;
  const trimmed = text.replace(/^\uFEFF/, '').trim();
  let rows, header = {};
  if (trimmed.startsWith('[')) rows = JSON.parse(trimmed);
  else {
    try {
      const single = JSON.parse(trimmed);
      if (single.events !== undefined) {
        const { events, ...fields } = single;
        header = fields;
      }
      rows = Array.isArray(single.events) ? single.events : typeof single.events === 'string' ? parseMjai(single.events) : [single];
    } catch (e) {
      if (!(e instanceof SyntaxError)) throw e;
      rows = trimmed.split(/\r?\n/).filter(s => s.trim()).map(s => JSON.parse(s));
    }
  }
  if (!Array.isArray(rows) || rows.length < 4 || rows[0]?.type !== 'start_game' || rows.at(-1)?.type !== 'end_game') {
    throw new Error('incomplete_mjai_game');
  }
  return { rows, header };
}

export function parseMjai(raw) { return parseMjaiDocument(raw).rows; }

// Fixed tuples, one linear pass. Dora publication can move around a discard in
// third-party converters; preserve its per-round sequence but not that timing
// in game identity. The original representation remains separately addressable.
export function mjaiIdentityProjection(rows) {
  const out = [], doras = [];
  let open = false, terminal = false, rounds = 0;
  for (let rowIndex = 0; rowIndex < rows.length; rowIndex++) {
    const r = rows[rowIndex];
    switch (r.type) {
      case 'start_game': if (rowIndex !== 0) throw new Error('nested_game'); break;
      case 'end_game': if (rowIndex !== rows.length - 1) throw new Error('trailing_game_events'); break;
      case 'start_kyoku':
        if (open || !['E', 'S', 'W', 'N'].includes(r.bakaze) || !Array.isArray(r.tehais) || r.tehais.length !== 4) throw new Error('invalid_round');
        if (![r.kyoku, r.honba, r.kyotaku].every(Number.isInteger) || r.kyoku < 1 || r.kyoku > 4 || r.honba < 0 || r.kyotaku < 0) throw new Error('invalid_round');
        out.push(['round', r.bakaze, r.kyoku, r.honba, r.kyotaku, seat(r.oya), scores(r.scores), r.tehais.map(hand), tile(r.dora_marker)]);
        doras.length = 0; open = true; terminal = false; rounds++;
        break;
      case 'tsumo':
        if (!open || terminal) throw new Error('action_outside_round');
        out.push(['draw', seat(r.actor), tile(r.pai)]); break;
      case 'dahai':
        if (!open || terminal || typeof r.tsumogiri !== 'boolean') throw new Error('invalid_discard');
        out.push(['discard', seat(r.actor), tile(r.pai), r.tsumogiri]); break;
      case 'chi': case 'pon': case 'daiminkan': {
        if (!open || terminal || !Array.isArray(r.consumed) || r.consumed.length !== (r.type === 'daiminkan' ? 3 : 2)) throw new Error('invalid_call');
        out.push([r.type, seat(r.actor), seat(r.target), tile(r.pai), r.consumed.map(tile).sort()]); break;
      }
      case 'ankan':
        if (!open || terminal || !Array.isArray(r.consumed) || r.consumed.length !== 4) throw new Error('invalid_ankan');
        out.push(['ankan', seat(r.actor), r.consumed.map(tile).sort()]); break;
      case 'kakan':
        if (!open || terminal) throw new Error('invalid_kakan');
        out.push(['kakan', seat(r.actor), tile(r.pai)]); break;
      case 'reach': case 'reach_accepted':
        if (!open || terminal) throw new Error('invalid_reach');
        out.push([r.type, seat(r.actor)]); break;
      case 'dora':
        if (!open) throw new Error('invalid_dora');
        doras.push(tile(r.dora_marker)); break;
      case 'hora':
        if (!open) throw new Error('invalid_hora');
        out.push(['hora', seat(r.actor), seat(r.target)]); terminal = true; break;
      case 'ryukyoku':
        if (!open || terminal) throw new Error('invalid_ryukyoku');
        out.push(['ryukyoku']); terminal = true; break;
      case 'end_kyoku':
        if (!open || !terminal) throw new Error('incomplete_round');
        out.push(['doras', [...doras]]); open = false; break;
      default: throw new Error(`unsupported_mjai_event:${r.type}`);
    }
  }
  if (open || rounds === 0) throw new Error('incomplete_game');
  return out;
}

export function xmlIdentityProjection(raw) {
  const tokens = tokenizeMjlog(raw), out = [], doras = [];
  const go = tokens.find(t => t.tag === 'GO');
  const type = Number(go?.attrs.type);
  if (!go || !Number.isInteger(type) || (type & 0x10)) throw new Error('unsupported_tenhou_rules');
  const red = (type & 2) === 0;
  const codes = Array.from({ length: 136 }, (_, n) => formatMjaiTile(tenhouTileCode(n, red)));
  const t = n => { if (!Number.isInteger(n) || !codes[n]) throw new Error('invalid_tile'); return codes[n]; };
  let open = false, terminal = false, rounds = 0, lastDiscard = null;
  const draws = [null, null, null, null];
  for (const { tag, attrs: a } of tokens) {
    if (tag === 'INIT') {
      if (open) {
        if (!terminal) throw new Error('incomplete_round');
        out.push(['doras', [...doras]]);
      }
      const seed = ints(a.seed);
      // Public MJAI exporters saturate the wind at N in historical games that
      // continue beyond North 4. Keep ordinal/action history; only normalize
      // this representation detail for identity. Canonical export stays strict.
      const wind = ['E', 'S', 'W', 'N'][Math.min(3, Math.floor(seed[0] / 4))];
      if (!wind) throw new Error('invalid_round');
      const hands = [0, 1, 2, 3].map(i => hand(ints(a[`hai${i}`]).map(t)));
      out.push(['round', wind, seed[0] % 4 + 1, seed[1], seed[2], seat(Number(a.oya)), scores(ints(a.ten).map(n => n * 100)), hands, t(seed[5])]);
      doras.length = 0; draws.fill(null); lastDiscard = null; open = true; terminal = false; rounds++;
    } else if (/^[TUVWDEFG]\d+$/.test(tag)) {
      if (!open || terminal) throw new Error('action_outside_round');
      const code = Number(tag.slice(1)), drawSeat = 'TUVW'.indexOf(tag[0]);
      if (drawSeat >= 0) { draws[drawSeat] = code; out.push(['draw', drawSeat, t(code)]); }
      else { const actor = 'DEFG'.indexOf(tag[0]); lastDiscard = { actor, pai: t(code) }; out.push(['discard', actor, t(code), draws[actor] === code]); draws[actor] = null; }
    } else if (tag === 'N') {
      if (!open || terminal) throw new Error('invalid_call');
      const actor = seat(Number(a.who)), m = decodeTenhouMeld(Number(a.m), red);
      if (m.flavor === 'ankan') out.push(['ankan', actor, m.tiles.map(formatMjaiTile).sort()]);
      else if (m.flavor === 'kakan') out.push(['kakan', actor, formatMjaiTile(m.addedTile)]);
      else {
        const target = (actor + m.relativeSeat) % 4, all = m.tiles.map(formatMjaiTile);
        if (!lastDiscard || lastDiscard.actor !== target) throw new Error('called_discard_mismatch');
        const index = all.indexOf(lastDiscard.pai);
        if (index < 0) throw new Error('called_tile_missing');
        all.splice(index, 1);
        out.push([m.flavor, actor, target, lastDiscard.pai, all.sort()]);
      }
      draws[actor] = null;
    } else if (tag === 'REACH') {
      if (!['1', '2'].includes(a.step) || !open || terminal) throw new Error('invalid_reach');
      out.push([a.step === '1' ? 'reach' : 'reach_accepted', seat(Number(a.who))]);
    } else if (tag === 'DORA') doras.push(t(Number(a.hai)));
    else if (tag === 'AGARI') { if (!open) throw new Error('invalid_hora'); out.push(['hora', seat(Number(a.who)), seat(Number(a.fromWho))]); terminal = true; }
    else if (tag === 'RYUUKYOKU') { if (!open || terminal) throw new Error('invalid_draw'); out.push(['ryukyoku']); terminal = true; }
    else if (['mjloggm', 'SHUFFLE', 'GO', 'TAIKYOKU', 'UN'].includes(tag)) {
      if (open && tag === 'UN') throw new Error('unsupported_reconnect');
    } else throw new Error(`unsupported_tenhou_tag:${tag}`);
  }
  if (!open || !terminal || !rounds) throw new Error('incomplete_game');
  out.push(['doras', [...doras]]);
  return { projection: out, tokens };
}

export function contentId(projection) {
  const firstDealer = projection[0]?.[5] ?? 0;
  if (firstDealer === 0) return `rc1_${sha256(JSON.stringify(projection))}`;
  const rotateActor = n => (n - firstDealer + 4) % 4;
  const rotateSeats = a => [...a.slice(firstDealer), ...a.slice(0, firstDealer)];
  const normalized = projection.map(tuple => {
    const row = [...tuple];
    if (row[0] === 'round') { row[5] = rotateActor(row[5]); row[6] = rotateSeats(row[6]); row[7] = rotateSeats(row[7]); }
    else if (!['doras', 'ryukyoku'].includes(row[0])) {
      row[1] = rotateActor(row[1]);
      if (['chi', 'pon', 'daiminkan', 'hora'].includes(row[0])) row[2] = rotateActor(row[2]);
    }
    return row;
  });
  return `rc1_${sha256(JSON.stringify(normalized))}`;
}

export function metadataFor({ name = '', metadata = {} }, header = {}) {
  const id = /\d{10}gm-[\da-f-]+/i.exec(name)?.[0];
  const soulDate = /(?:^|[/\\])(\d{6})[-_][\da-f_-]+/i.exec(name)?.[1];
  let playedAt = null;
  const timestamp = header.start_time ?? header.startTime ?? header.timestamp;
  if (typeof timestamp === 'number' && timestamp > 0) playedAt = { value: new Date(timestamp < 1e12 ? timestamp * 1000 : timestamp).toISOString(), precision: 'second', sourceField: 'header.start_time' };
  else if (typeof header.date === 'string') playedAt = { value: header.date, precision: 'source', sourceField: 'header.date' };
  else if (id) playedAt = { value: `${id.slice(0, 4)}-${id.slice(4, 6)}-${id.slice(6, 8)}T${id.slice(8, 10)}:00:00+09:00`, precision: 'hour', sourceField: 'tenhou-log-id' };
  else if (soulDate) playedAt = { value: `20${soulDate.slice(0, 2)}-${soulDate.slice(2, 4)}-${soulDate.slice(4, 6)}`, precision: 'day', timeZone: null, sourceField: 'majsoul-uuid' };
  return { playedAt, ranks: header.dan ?? header.ranks ?? header.levels ?? null, ...metadata };
}

export function prepareRecord(raw, format, context = {}) {
  const started = performance.now();
  let projection, parsed, metadata;
  if (format === 'xml') {
    const result = xmlIdentityProjection(raw.toString('utf8'));
    projection = result.projection; parsed = result.tokens;
    const un = parsed.find(t => t.tag === 'UN')?.attrs;
    metadata = metadataFor(context, { dan: un?.dan ? ints(un.dan) : null });
    if (un?.dan) metadata.rankSystem = 'tenhou-dan-code';
    if (un?.rate) metadata.ratings = un.rate.split(',').map(Number);
  } else if (format === 'mjai') {
    const document = parseMjaiDocument(raw);
    parsed = document.rows;
    projection = mjaiIdentityProjection(parsed);
    metadata = metadataFor(context, { ...document.header, ...parsed[0] });
  } else throw new Error(`unsupported_format:${format}`);
  const normalizedAt = performance.now();
  const id = contentId(projection), rawHash = sha256(raw);
  return { id, rawHash, format, raw, metadata, parsed,
    timing: { normalizeMs: normalizedAt - started, hashMs: performance.now() - normalizedAt } };
}
