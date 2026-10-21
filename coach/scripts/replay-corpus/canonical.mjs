import { CanonicalEventStreamSchema, CANONICAL_EVENT_SCHEMA_VERSION, sortTilesCanonical } from '@riichi-coach/contracts';
import { mapTenhouRecord } from '@riichi-coach/tenhou-source';
import { parseMjaiTile } from '@riichi-coach/mortal-source';
import { parseMjai, mjaiIdentityProjection, sha256 } from './identity.mjs';

export const MJAI_MAPPER_VERSION = 'public-mjai-mapper/v1';
const quad = v => Array.isArray(v) && v.length === 4 && v.every(Number.isInteger);
const tiles = a => sortTilesCanonical(a.map(parseMjaiTile));
const unknownRules = { length: 'unknown', redFives: { man: 'unknown', pin: 'unknown', sou: 'unknown' }, openTanyao: 'unknown', atamahane: 'unknown', westExtension: 'unknown', ippatsuCancelledByAnkan: 'unknown' };

// Projection only. No score/yaku/legality engine; absent rule/settlement fields
// remain partial. Actual analysis still passes through the existing validators.
export function mapMjaiRecord(raw, gameId, selfActor, ruleSet = unknownRules) {
  if (!Number.isInteger(selfActor) || selfActor < 0 || selfActor > 3) throw new Error('invalid_self_actor');
  const rows = parseMjai(raw);
  mjaiIdentityProjection(rows);
  const events = [], declares = new Map(), pons = new Map(), lastDraw = new Map();
  let round = -1, sourceOrdinal = 0, sub = 0, lastDiscard = null, lastKan = null, rinshan = false;
  let settled = null, initial = null, running = null, terminalRef = null, completeSettlement = true;
  const add = data => {
    const e = { ...data, eventId: `${gameId}/${Math.max(round, 0)}/${sourceOrdinal}/${sub++}`, sourceRecordRef: `${gameId}:mjai:${sourceOrdinal}` };
    events.push(e); return e.eventId;
  };
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i]; sourceOrdinal = i; sub = 0;
    switch (r.type) {
      case 'start_game': add({ type: 'game_started' }); break;
      case 'start_kyoku':
        if (!['E', 'S', 'W'].includes(r.bakaze)) throw new Error('unsupported_north_round');
        round++; declares.clear(); pons.clear(); lastDraw.clear(); lastDiscard = null; lastKan = null; rinshan = false; terminalRef = null;
        initial = [...r.scores]; running = [...r.scores]; settled = null;
        add({ type: 'round_started', roundOrdinal: round, roundWind: r.bakaze, hand: r.kyoku, honba: r.honba, riichiSticks: r.kyotaku, dealer: r.oya, scores: r.scores, doraIndicator: parseMjaiTile(r.dora_marker), selfHand: tiles(r.tehais[selfActor]), remainingDraws: 70 });
        break;
      case 'tsumo': {
        const ref = add({ type: 'tile_drawn', actor: r.actor, tile: r.actor === selfActor ? { visibility: 'visible', tile: parseMjaiTile(r.pai) } : { visibility: 'hidden' }, from: rinshan ? 'rinshan' : 'live_wall' });
        lastDraw.set(r.actor, { ref, pai: r.pai }); rinshan = false; break;
      }
      case 'dahai': {
        const ref = add({ type: 'tile_discarded', actor: r.actor, tile: parseMjaiTile(r.pai), discardMode: r.tsumogiri ? 'tsumogiri' : 'tedashi', riichiDeclarationEventRef: declares.get(r.actor)?.pending ?? null });
        lastDiscard = { ref, actor: r.actor, pai: r.pai };
        const declaration = declares.get(r.actor); if (declaration) declaration.pending = null;
        break;
      }
      case 'reach': {
        const ref = add({ type: 'riichi_declared', actor: r.actor }); declares.set(r.actor, { ref, pending: ref }); break;
      }
      case 'reach_accepted':
        if (!declares.has(r.actor)) throw new Error('missing_riichi_declaration');
        add({ type: 'riichi_accepted', actor: r.actor, declarationEventRef: declares.get(r.actor).ref });
        running[r.actor] -= 1000;
        break;
      case 'chi': case 'pon': case 'daiminkan': {
        if (!lastDiscard || lastDiscard.actor !== r.target || lastDiscard.pai !== r.pai) throw new Error('called_discard_mismatch');
        const ref = add({ type: `${r.type}_called`, actor: r.actor, targetActor: r.target, calledTile: parseMjaiTile(r.pai), consumedTiles: tiles(r.consumed), calledDiscardEventRef: lastDiscard.ref });
        if (r.type === 'pon') pons.set(`${r.actor}:${parseMjaiTile(r.pai).id}`, ref);
        if (r.type === 'daiminkan') { lastKan = { ref, actor: r.actor, pai: r.pai }; rinshan = true; }
        break;
      }
      case 'ankan': {
        const ref = add({ type: 'ankan_declared', actor: r.actor, tiles: tiles(r.consumed) });
        lastKan = { ref, actor: r.actor, pai: r.consumed[0] }; rinshan = true; break;
      }
      case 'kakan': {
        const pon = pons.get(`${r.actor}:${parseMjaiTile(r.pai).id}`);
        if (!pon) throw new Error('missing_upgraded_pon');
        const ref = add({ type: 'kakan_declared', actor: r.actor, addedTile: parseMjaiTile(r.pai), upgradedPonEventRef: pon });
        lastKan = { ref, actor: r.actor, pai: r.pai }; rinshan = true; break;
      }
      case 'dora':
        if (!lastKan) throw new Error('missing_dora_kan');
        add({ type: 'dora_revealed', indicator: parseMjaiTile(r.dora_marker), kanEventRef: lastKan.ref }); break;
      case 'hora': {
        const tsumo = r.actor === r.target;
        // An unconsumed kan (rinshan pending) is the robbery source, otherwise
        // the last public discard. No guess from a stale last-actor variable.
        const trigger = tsumo ? lastDraw.get(r.actor) : rinshan && lastKan?.actor === r.target ? lastKan : lastDiscard;
        if (!trigger || (!tsumo && trigger.actor !== r.target)) throw new Error('missing_win_source');
        const before = terminalRef ? settled : initial;
        if (quad(r.scores)) settled = [...r.scores];
        else if (quad(r.deltas) && running) settled = running.map((n, p) => n + r.deltas[p]);
        else { settled = null; completeSettlement = false; }
        const deltas = settled && before ? settled.map((n, p) => n - before[p]) : null;
        const ref = add({ type: 'win_declared', winnerActor: r.actor, targetActor: tsumo ? null : r.target, method: tsumo ? 'tsumo' : 'ron', winningTile: parseMjaiTile(r.pai ?? trigger.pai), winSourceEventRef: trigger.ref, scoreDeltas: deltas });
        terminalRef ??= ref; running = settled; break;
      }
      case 'ryukyoku': {
        const reasons = { fanpai: 'exhaustive', exhaustive: 'exhaustive', yao9: 'kyuushu_kyuuhai', kaze4: 'suufon_renda', reach4: 'suucha_riichi', kan4: 'suukaikan', ron3: 'sancha_hou', nm: 'nagashi_mangan' };
        const reason = reasons[r.reason] ?? 'unknown';
        // Some converted archives omit the reason. Do not turn an abortive
        // draw into an exhaustive draw to make an export appear complete.
        if (r.reason !== undefined && reason === 'unknown') throw new Error('mjai_draw_reason_unsupported');
        const knownTenpai = Array.isArray(r.tenpais) && r.tenpais.length === 4 && r.tenpais.every(x => typeof x === 'boolean');
        if (reason === 'unknown' || !knownTenpai) completeSettlement = false;
        terminalRef = add({ type: 'round_drawn', reason, tenpaiActors: knownTenpai ? r.tenpais.flatMap((t, p) => t ? [p] : []) : null });
        if (quad(r.scores)) settled = [...r.scores];
        else if (quad(r.deltas) && running) settled = running.map((n, p) => n + r.deltas[p]);
        else { settled = null; completeSettlement = false; }
        running = settled; break;
      }
      case 'end_kyoku': {
        if (!terminalRef) throw new Error('missing_round_terminal');
        if (!settled) {
          const next = rows[i + 1];
          if (next?.type === 'start_kyoku' && quad(next.scores)) settled = next.scores;
          else if (next?.type === 'end_game' && quad(next.scores)) settled = next.scores;
        }
        if (settled) add({ type: 'scores_updated', scores: settled, settlementEventRef: terminalRef });
        add({ type: 'round_ended', terminalEventRef: terminalRef }); break;
      }
      case 'end_game':
        if (quad(r.scores)) settled = r.scores;
        if (!settled) throw new Error('mjai_final_scores_missing');
        add({ type: 'game_ended', scores: settled }); break;
      default: throw new Error(`unsupported_mjai_event:${r.type}`);
    }
  }
  const rulesComplete = !JSON.stringify(ruleSet).includes('unknown');
  return CanonicalEventStreamSchema.parse({ schemaVersion: CANONICAL_EVENT_SCHEMA_VERSION, mapperVersion: MJAI_MAPPER_VERSION, gameId, sourceKind: 'mjai', sourceRecordHash: sha256(raw), playerCount: 4, selfActor, ruleSet,
    completeness: { eventSequence: 'complete', ruleSet: rulesComplete ? 'complete' : 'partial', scores: completeSettlement ? 'complete' : 'partial', doraIndicators: 'complete', rivers: 'complete', calledDiscardMarkers: 'complete', melds: 'complete', remainingDraws: 'complete', settlement: completeSettlement ? 'complete' : 'partial', responseOpportunities: 'complete' }, events });
}

export function toCanonical(record, selfActor = 0, ruleSet) {
  if (record.format === 'xml') {
    const result = mapTenhouRecord({ raw: record.raw.toString('utf8'), gameId: record.game_id, selfActor });
    if (result.status !== 'ready') throw new Error(result.code);
    return result.stream;
  }
  return mapMjaiRecord(record.raw, record.game_id, selfActor, ruleSet);
}
