import { LabConstructRequestSchema, PairScanCoordinateSchema, type LabSample, type LabConstructRequest,
  type LabConstructResult, type PairScanCoordinate, type LabBoardSpec } from "@riichi-coach/contracts";
import { formatMjaiTile } from "@riichi-coach/mortal-source";
import { digest } from "./config.js";
import { TILES, tile34, resolveScene, controlledBoard, constructionRequest } from "./construct.js";
import { QuestionLabConfigSchema } from "@riichi-coach/contracts";
import { pendingDecision, observableComponents } from "./projection.js";
import { pairObservations } from "./pair-features.js";

export type Witness = { request: LabConstructRequest; result: Extract<LabConstructResult, { status: "ok" }> };
type Slot = [number, number];
const slotKey = (s: Slot) => s.join(":");
const zones = (b: LabBoardSpec) => [...b.haipai, b.yama, b.rinshan, b.dora_indicators, b.ura_indicators];
export const previousIndicator = (tile: string) => {
  const i = tile34(tile);
  return TILES[i < 27 ? Math.floor(i / 9) * 9 + (i % 9 + 8) % 9 : i < 31 ? 27 + (i - 27 + 3) % 4 : 31 + (i - 31 + 2) % 3]!;
};

// Track physical ownership through a quiet history; no hidden slot is a feature.
function trace(w: Witness) {
  const hands: Slot[][] = w.request.spec.haipai.map((h, actor) => h.map((_, i) => [actor, i]));
  const draws: number[] = [0, 0, 0, 0], last: Slot[] = [];
  const discarded: { actor: number; tile: string; slot: Slot; occurrence: number }[] = [];
  const zs = zones(w.request.spec);
  let position = 0;
  for (const e of w.result.events) {
    if (["chi", "pon", "ankan", "daiminkan", "kakan", "reach", "reach_accepted"].includes(e.type))
      throw new Error("scan_anchor_not_quiet");
    if (e.type === "tsumo") {
      const slot: Slot = [4, position++]; hands[e.actor!]!.push(slot); last[e.actor!] = slot; draws[e.actor!]!++;
    }
    if (e.type === "dahai") {
      const hand = hands[e.actor!]!, slot = e.tsumogiri ? last[e.actor!]! : hand.find(s => zs[s[0]]![s[1]] === e.pai)!;
      if (!slot || !hand.includes(slot)) throw new Error("scan_physical_trace_failed");
      hand.splice(hand.indexOf(slot), 1);
      discarded.push({ actor: e.actor!, tile: e.pai!, slot, occurrence: draws[e.actor!]! });
    }
  }
  const protectedSlots = new Set<string>([
    ...discarded.map(d => slotKey(d.slot)), ...hands[w.request.selfActor]!.map(slotKey), "6:0",
  ]);
  return { hands, discarded, protectedSlots, drawIndex: position - 1 };
}
export function swapAssignments(b: LabBoardSpec, assignments: { slot: Slot; tile: string }[], protectedSlots: Set<string>) {
  const board = structuredClone(b), z = zones(board), protect = new Set(protectedSlots);
  for (const a of assignments) protect.delete(slotKey(a.slot));
  for (const a of assignments) {
    const target = z[a.slot[0]]!;
    if (target[a.slot[1]] !== a.tile) {
      let source: Slot | undefined;
      for (let zone = 0; zone < z.length && !source; zone++)
        for (let i = 0; i < z[zone]!.length; i++)
          if (!protect.has(slotKey([zone, i])) && z[zone]![i] === a.tile) { source = [zone, i]; break; }
      if (!source) throw new Error("scan_tile_unavailable");
      [target[a.slot[1]], z[source[0]]![source[1]]] = [z[source[0]]![source[1]]!, target[a.slot[1]]!];
    }
    protect.add(slotKey(a.slot));
  }
  return board;
}
export function requestWith(w: Witness, spec: LabBoardSpec, changes: Partial<LabConstructRequest> = {}) {
  const { requestId: _, ...original } = w.request;
  const content = { ...original, spec, ...changes };
  return LabConstructRequestSchema.parse({ ...content, requestId: digest(content) });
}
export function retargetDora(w: Witness, indicator: string) {
  return requestWith(w, swapAssignments(w.request.spec, [{ slot: [6, 0], tile: indicator }], trace(w).protectedSlots));
}
function coordinate(anchorId: string, axis: PairScanCoordinate["axis"], values: PairScanCoordinate["values"], phase: "scan" | "threat" = "scan") {
  const data = { anchorId, axis, values, phase };
  return PairScanCoordinateSchema.parse({ schemaVersion: "question-lab-scan/v2", id: digest(data), ...data });
}
export function scanCoordinates(sample: LabSample): PairScanCoordinate[] {
  const info = pairObservations(sample), a = info.e[0], b = info.d[0];
  if (!a || !b) return [];
  const ae = new Set(a.result!.effectiveTile34), be = new Set(b.result!.effectiveTile34);
  const critical = [...new Set([...ae, ...be])].filter(t => ae.has(t) !== be.has(t)).sort((a, b) => a - b).slice(0, 2);
  const rows: PairScanCoordinate[] = [];
  for (const t of critical) for (let remaining = 0; remaining <= 4; remaining++)
    rows.push(coordinate(sample.sampleId, "availability", { [`tile${t}`]: remaining }));
  if (critical.length === 2) {
    rows.push(coordinate(sample.sampleId, "availability", { [`tile${critical[0]}`]: 0, [`tile${critical[1]}`]: 4 }));
    rows.push(coordinate(sample.sampleId, "availability", { [`tile${critical[0]}`]: 4, [`tile${critical[1]}`]: 0 }));
  }
  const f = pendingDecision(sample.stream).facts;
  const tiles = [...f.concealedTiles, ...(f.currentDraw ? [f.currentDraw.tile] : [])].map(formatMjaiTile);
  const ranked = [...TILES].sort((a, b) => tiles.filter(t => tile34(t) === tile34(b)).length - tiles.filter(t => tile34(t) === tile34(a)).length || tile34(a) - tile34(b));
  const indicators = [...new Set([previousIndicator(TILES[a.metrics.tile34!]!), previousIndicator(TILES[b.metrics.tile34!]!),
    ...ranked.filter(t => tiles.some(h => tile34(h) === tile34(t))).map(previousIndicator),
    ...ranked.filter(t => !tiles.some(h => tile34(h) === tile34(t))).map(previousIndicator)])]
    .filter(t => t !== formatMjaiTile(f.doraIndicators[0]!)).slice(0, 8);
  for (const indicator of indicators) rows.push(coordinate(sample.sampleId, "dora", { indicator }));
  for (const delta of [-12000, -8000, -4000, -2000, 2000, 4000, 8000, 12000]) rows.push(coordinate(sample.sampleId, "scores", { delta }));
  for (let turns = 1; turns <= 8; turns++) rows.push(coordinate(sample.sampleId, "turn", { turns }));
  return rows;
}
export function threatCoordinates(sample: LabSample) {
  return ["next_riichi", "opposite_riichi", "next_pon", "two_riichi"].map(kind => coordinate(sample.sampleId, "threat", { kind }, "threat"));
}
export function baselineScanPoints(sample: LabSample, gap: number) {
  const f = pendingDecision(sample.stream).facts;
  const seen = [...f.concealedTiles, ...(f.currentDraw ? [f.currentDraw.tile] : []), ...f.doraIndicators, ...f.rivers.flatMap(r => r.map(t => t.tile))];
  const keys = [...new Set(scanCoordinates(sample).filter(c => c.axis === "availability").flatMap(c => Object.keys(c.values)))];
  return [coordinate(sample.sampleId, "scores", { delta: 0 }), coordinate(sample.sampleId, "turn", { turns: 0 }),
    ...keys.map(key => coordinate(sample.sampleId, "availability", { [key]: 4 - seen.filter(t => tile34(formatMjaiTile(t)) === Number(key.slice(4))).length }))]
    .map(coordinate => ({ coordinate, gap }));
}
export function scanRequest(w: Witness, sample: LabSample, c: PairScanCoordinate): LabConstructRequest {
  if (c.axis === "joint") {
    let next = w;
    for (const [key, value] of Object.entries(c.values)) {
      const [axis, field] = key.split(".");
      next = { ...next, request: scanRequest(next, sample, coordinate(c.anchorId, axis as PairScanCoordinate["axis"], { [field!]: value })) };
    }
    return next.request;
  }
  const original = w.request, t = trace(w);
  let spec = structuredClone(original.spec), turn = original.turn;
  if (c.axis === "dora") return retargetDora(w, String(c.values.indicator));
  if (c.axis === "scores") {
    const delta = Number(c.values.delta), actor = original.selfActor, other = (actor + 1) % 4;
    spec.scores[actor]! += delta; spec.scores[other]! -= delta;
    if (spec.scores.some(s => s < 0)) throw new Error("scan_negative_scores");
  }
  if (c.axis === "availability") {
    const f = pendingDecision(sample.stream).facts;
    const visible = [...f.concealedTiles, ...(f.currentDraw ? [f.currentDraw.tile] : []), ...f.doraIndicators,
      ...f.rivers.flatMap(r => r.map(d => d.tile))].map(formatMjaiTile);
    const keys = Object.keys(c.values).map(k => Number(k.slice(4)));
    const edits = new Map<string, { slot: Slot; tile: string }>();
    for (const key of keys) {
      const current = 4 - visible.filter(v => tile34(v) === key).length;
      let difference = current - Number(c.values[`tile${key}`]);
      const pool = t.discarded.filter(d => d.actor !== original.selfActor && !edits.has(slotKey(d.slot)) &&
        (difference > 0 ? !keys.includes(tile34(d.tile)) : tile34(d.tile) === key));
      for (const entry of pool) {
        if (!difference) break;
        let tile = TILES[key]!;
        if (difference < 0) {
          const z = zones(spec);
          const filler = z.flatMap((a, zi) => a.map((v, i) => ({ tile: v, slot: [zi, i] as Slot })))
            .find(s => !t.protectedSlots.has(slotKey(s.slot)) && !keys.includes(tile34(s.tile)));
          if (!filler) throw new Error("scan_tile_unavailable");
          tile = filler.tile;
        }
        const edit = { slot: entry.slot, tile };
        spec = swapAssignments(spec, [edit], t.protectedSlots);
        edits.set(slotKey(entry.slot), edit);
        difference += difference > 0 ? -1 : 1;
      }
      if (difference) throw new Error("scan_remaining_unreachable");
    }
    const script = t.discarded.map(d => ({ after: { type: "tsumo" as const, actor: d.actor, occurrence: d.occurrence },
      action: { type: "dahai" as const, actor: d.actor, pai: edits.get(slotKey(d.slot))?.tile ?? d.tile,
        tsumogiri: w.result.events.filter(e => e.type === "dahai" && e.actor === d.actor)[d.occurrence - 1]?.tsumogiri ?? true } }));
    return requestWith(w, spec, { script });
  }
  if (c.axis === "turn") {
    const n = Number(c.values.turns); turn += n;
    const pairs = pairObservations(sample).pairs;
    const excluded = new Set<number>(sample.candidates.filter(x => pairs.some(p => p.eRef === x.actionRef || p.dRef === x.actionRef))
      .flatMap(x => x.result!.effectiveTile34));
    const f = pendingDecision(sample.stream).facts;
    const dora = f.doraIndicators.map(x => (tile34(formatMjaiTile(x)) < 27 ?
      Math.floor(tile34(formatMjaiTile(x)) / 9) * 9 + (tile34(formatMjaiTile(x)) % 9 + 1) % 9 : -1));
    for (const x of dora) excluded.add(x);
    const rest = spec.yama.slice(t.drawIndex + 1), selected = rest.map((tile, i) => ({ tile, i })).filter(x => !excluded.has(tile34(x.tile))).slice(0, 4 * n);
    if (selected.length !== 4 * n || t.drawIndex + 4 * n >= 70 || turn > 18) throw new Error("scan_turn_unreachable");
    const selectedIds = new Set(selected.map(x => x.i));
    spec.yama = [...spec.yama.slice(0, t.drawIndex), ...selected.map(x => x.tile), spec.yama[t.drawIndex]!, ...rest.filter((_, i) => !selectedIds.has(i))];
  }
  if (c.axis === "threat") {
    const self = original.selfActor, next = (self + 1) % 4, opposite = (self + 2) % 4;
    const kind = String(c.values.kind), players = kind === "next_pon"
      ? [{ actor: next, melds: { fixed: [{ kind: "pon", tiles: ["P", "P", "P"], target: opposite }] } }]
      : (kind === "two_riichi" ? [next, opposite] : [kind === "opposite_riichi" ? opposite : next]).map(actor => ({ actor, riichi: { fixed: true } }));
    const config = QuestionLabConfigSchema.parse({ schemaVersion: "question-lab-config/v1", seed: original.seed,
      scene: { selfActor: { fixed: self }, round: { fixed: spec.kyoku }, turn: { fixed: turn },
        scores: { fixed: spec.scores }, honba: { fixed: spec.honba }, riichiSticks: { fixed: spec.kyotaku },
        draw: { fixed: spec.yama[t.drawIndex]! }, doraIndicators: { fixed: [spec.dora_indicators[0]!] },
        players: [{ actor: self, initialHand: { fixed: spec.haipai[self] } }, ...players] } });
    const scene = resolveScene(config.scene, original.seed);
    // Threats necessarily change the prefix. Preserve the self hand/draw and
    // indicator, while allowing past opponent draws to be reallocated legally.
    const protectedSlots = new Set<string>([...spec.haipai[self]!.map((_, i) => slotKey([self, i])), "6:0", slotKey([4, t.drawIndex])]);
    const assignments = scene.players.flatMap(p => (p.initialHand ?? []).map((tile, i) => ({ slot: [p.actor, i] as Slot, tile })));
    const board = swapAssignments(spec, assignments, protectedSlots);
    return constructionRequest(scene, board, original.identity, original.seed, original.maxSteps);
  }
  return requestWith(w, spec, { turn });
}

export function repairThreatDraw(base: Witness, request: LabConstructRequest, result: Extract<LabConstructResult, { status: "ok" }>) {
  const wanted = base.request.spec.yama[trace(base).drawIndex]!;
  const index = result.events.filter(e => e.type === "tsumo").length - 1;
  if (request.spec.yama[index] === wanted) return null;
  const protect = new Set(request.spec.haipai.flatMap((hand, actor) => hand.map((_, i) => slotKey([actor, i]))));
  protect.add("6:0");
  return requestWith({ ...base, request }, swapAssignments(request.spec, [{ slot: [4, index], tile: wanted }], protect));
}

export function verifyScan(base: LabSample, variant: LabSample, c: PairScanCoordinate, w: Witness, request: LabConstructRequest, targetsOnly = false) {
  const before = observableComponents(base.stream), after = observableComponents(variant.stream);
  const held = ["selfActor", "hand", "draw"];
  for (const key of held) if (digest(before[key]) !== digest(after[key])) throw new Error(`scan_held_${key}_changed`);
  if (base.features.round !== variant.features.round || base.features.dealer !== variant.features.dealer)
    throw new Error("scan_held_round_changed");
  const allowed: Record<string, string[]> = {
    availability: ["players", "rivers", "history"], dora: ["doraIndicators", "history"], scores: ["scores", "history"],
    turn: ["turn", "remainingDraws", "players", "rivers", "history"],
    threat: ["scores", "round", "players", "rivers", "riichi", "melds", "history", "remainingDraws"],
    joint: ["scores", "doraIndicators", "history", "players", "rivers", "remainingDraws", "turn"],
  };
  const changed = Object.keys(after).filter(k => digest(before[k]) !== digest(after[k]));
  for (const key of changed) if (!targetsOnly && !allowed[c.axis]!.includes(key)) throw new Error(`scan_undeclared_${key}_changed`);
  if (c.axis === "dora" && formatMjaiTile(pendingDecision(variant.stream).facts.doraIndicators[0]!) !== c.values.indicator)
    throw new Error("scan_dora_target_missed");
  if (c.axis === "scores") {
    const a = w.request.selfActor;
    if (variant.features.score !== base.features.score! + Number(c.values.delta)) throw new Error("scan_score_target_missed");
    void a;
  }
  if (c.axis === "turn" && variant.features.turn !== base.features.turn! + Number(c.values.turns)) throw new Error("scan_turn_target_missed");
  if (c.axis === "availability") {
    const f = pendingDecision(variant.stream).facts;
    const seen = [...f.concealedTiles, ...(f.currentDraw ? [f.currentDraw.tile] : []), ...f.doraIndicators, ...f.rivers.flatMap(r => r.map(t => t.tile))];
    for (const [key, remaining] of Object.entries(c.values))
      if (4 - seen.filter(t => tile34(formatMjaiTile(t)) === Number(key.slice(4))).length !== remaining) throw new Error("scan_remaining_target_missed");
  }
  if (c.axis === "threat") {
    const f = pendingDecision(variant.stream).facts, kind = String(c.values.kind);
    if (kind === "next_pon" ? !f.melds.some(m => m.kind === "pon" && m.actor === (f.actor + 1) % 4)
      : f.defenseThreats.length < (kind === "two_riichi" ? 2 : 1)) throw new Error("scan_threat_target_missed");
  }
  if (c.axis === "joint") {
    const grouped = new Map<string, Record<string, string | number>>();
    for (const [key, value] of Object.entries(c.values)) {
      const [axis, field] = key.split(".");
      const values = grouped.get(axis!) ?? {}; values[field!] = value; grouped.set(axis!, values);
    }
    for (const [axis, values] of grouped)
      verifyScan(base, variant, { ...c, axis: axis as PairScanCoordinate["axis"], values }, w, request, true);
  }
  return [...changed, ...["haipai", "yama", "rinshan", "dora_indicators", "ura_indicators"].filter(k =>
    digest(w.request.spec[k as keyof LabBoardSpec]) !== digest(request.spec[k as keyof LabBoardSpec])).map(k => `construction.${k}`)];
}

export function jointCoordinates(anchorId: string, rows: { coordinate: PairScanCoordinate; gap: number | null }[]) {
  const axes = ["availability", "dora", "scores", "turn"];
  const ranked = axes.map(axis => {
    const eligible = rows.filter(r => r.coordinate.axis === axis && r.gap !== null).sort((a, b) => a.gap! - b.gap!);
    return { range: eligible.length > 1 ? eligible.at(-1)!.gap! - eligible[0]!.gap! : -1, eligible };
  }).sort((a, b) => b.range - a.range).slice(0, 2);
  const out: PairScanCoordinate[] = [];
  // Prefer integer interior points of observed adjacent sign transitions.
  for (const axis of axes) {
    const eligible = rows.filter(r => r.coordinate.axis === axis && r.gap !== null && Object.keys(r.coordinate.values).length === 1);
    const keys = [...new Set(eligible.map(r => Object.keys(r.coordinate.values)[0]!))];
    for (const field of keys) {
      const numeric = eligible.filter(r => typeof r.coordinate.values[field] === "number")
        .sort((a, b) => Number(a.coordinate.values[field]) - Number(b.coordinate.values[field]));
      for (let i = 1; i < numeric.length && out.length < 12; i++) {
        const a = numeric[i - 1]!, b = numeric[i]!;
        if (a.gap! * b.gap! >= 0) continue;
        const x = Number(a.coordinate.values[field]), y = Number(b.coordinate.values[field]);
        const step = axis === "scores" ? 1000 : 1;
        const value = Math.round((x + y) / (2 * step)) * step;
        if (value !== x && value !== y) out.push(coordinate(anchorId, axis as PairScanCoordinate["axis"], { [field]: value }));
      }
    }
  }
  if (ranked.some(r => r.eligible.length < 2)) return [...new Map(out.map(c => [c.id, c])).values()].slice(0, 12);
  // Remaining budget crosses the two most responsive axes, using actual legal coordinates.
  const first = ranked[0]!.eligible, second = ranked[1]!.eligible;
  for (const a of [first[0]!, first[Math.floor(first.length / 2)]!, first.at(-1)!])
    for (const b of [second[0]!, second[Math.floor(second.length / 2)]!, second.at(-1)!]) {
      const values = Object.fromEntries([a, b].flatMap(r => Object.entries(r.coordinate.values).map(([k, v]) => [`${r.coordinate.axis}.${k}`, v])));
      out.push(coordinate(anchorId, "joint", values));
    }
  return [...new Map(out.map(c => [c.id, c])).values()].slice(0, 12);
}
