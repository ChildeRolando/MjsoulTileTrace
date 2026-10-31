import {
  LabBoardSpecSchema,
  LabConstructRequestSchema,
  type LabScene,
  type LabBoardSpec,
  type LabConstructRequest,
  type LabConstructionIdentitySchema,
} from "@riichi-coach/contracts";
import type { z } from "zod";
import { choose, Random, digest } from "./config.js";

export const TILES = [..."mps"]
  .flatMap((s) => Array.from({ length: 9 }, (_, i) => `${i + 1}${s}`))
  .concat(["E", "S", "W", "N", "P", "F", "C"]);
export const tile34 = (tile: string) =>
  tile.length === 1
    ? 27 + "ESWNPFC".indexOf(tile)
    : "mps".indexOf(tile[1]!) * 9 + Number(tile[0]) - 1;
export function handFamily(hand: readonly string[]): string {
  const permutations = ["mps", "msp", "pms", "psm", "smp", "spm"];
  const forms = permutations.flatMap((permutation) =>
    [false, true].map((mirror) =>
      hand
        .map((tile) =>
          tile.length === 1
            ? tile
            : `${mirror ? 10 - Number(tile[0]) : tile[0]}${permutation["mps".indexOf(tile[1]!)]}${tile.endsWith("r") ? "r" : ""}`,
        )
        .sort()
        .join(","),
    ),
  );
  return digest(forms.sort()[0]);
}
export type ResolvedScene = {
  selfActor: number;
  round: number;
  honba: number;
  riichiSticks: number;
  scores: [number, number, number, number];
  turn: number;
  hand?: string[];
  draw?: string;
  doraIndicators?: string[];
  remainingDraws?: number;
  players: {
    actor: number;
    initialHand?: string[];
    concealed?: string[];
    river?: string[];
    melds?: { kind: string; tiles: string[]; target?: number }[];
    riichi?: boolean;
  }[];
  history: LabScene["history"];
  wall?: (string | null)[];
  rinshan?: (string | null)[];
  uraIndicators?: (string | null)[];
};
export function resolveScene(scene: LabScene, seed: number): ResolvedScene {
  const r = new Random(seed),
    sticks = choose<number>(scene.riichiSticks, r);
  const out: ResolvedScene = {
    selfActor: choose<number>(scene.selfActor, r),
    round: choose<number>(scene.round, r),
    honba: choose<number>(scene.honba, r),
    riichiSticks: sticks,
    scores: scene.scores
      ? choose(scene.scores, r)
      : [25000 - sticks * 1000, 25000, 25000, 25000],
    turn: choose<number>(scene.turn, r),
    players: [],
    history: structuredClone(scene.history),
  };
  for (const key of [
    "hand",
    "draw",
    "doraIndicators",
    "remainingDraws",
    "wall",
    "rinshan",
    "uraIndicators",
  ] as const) {
    const v = scene[key];
    if (v)
      (out as unknown as Record<string, unknown>)[key] = choose(v as never, r);
  }
  for (const p of scene.players) {
    const target: ResolvedScene["players"][number] = { actor: p.actor };
    for (const key of [
      "initialHand",
      "concealed",
      "river",
      "melds",
      "riichi",
    ] as const) {
      const v = p[key];
      if (v) (target as Record<string, unknown>)[key] = choose(v as never, r);
    }
    out.players.push(target);
  }
  if (out.scores.reduce((a, b) => a + b, 0) + sticks * 1000 !== 100000)
    throw new Error("contradiction_score_conservation");
  return prepareGoals(out, seed);
}
/** Constructive proposals only: every requested event is accepted by native Board or rejected. */
function prepareGoals(source: ResolvedScene, seed: number): ResolvedScene {
  const scene = structuredClone(source),
    r = new Random(seed ^ 0x542e1a),
    required = new Map<number, string[]>(),
    explicit = new Set<number>();
  const provided = new Map<string, number>();
  for (const h of source.history) {
    const key = `${h.action.actor}:${h.action.type}`;
    provided.set(key, (provided.get(key) ?? 0) + 1);
  }
  const player = (actor: number) => {
    let p = scene.players.find((p) => p.actor === actor);
    if (!p) {
      p = { actor };
      scene.players.push(p);
    }
    return p;
  };
  for (const p of scene.players)
    if (p.initialHand) {
      required.set(p.actor, [...p.initialHand]);
      explicit.add(p.actor);
    }
  for (const p of scene.players)
    if (p.concealed && !p.melds?.length && !p.initialHand) {
      if (p.concealed.length !== 13)
        throw new Error("contradiction_concealed_size");
      required.set(p.actor, [...p.concealed]);
      explicit.add(p.actor);
      p.initialHand = [...p.concealed];
    }
  const reserve = (actor: number, tiles: string[]) => {
    if (explicit.has(actor)) return;
    required.set(actor, [...(required.get(actor) ?? []), ...tiles]);
  };
  const add = (
    type: LabScene["history"][number]["after"]["type"],
    actor: number,
    occurrence: number,
    action: LabScene["history"][number]["action"],
  ) => scene.history.push({ after: { type, actor, occurrence }, action });
  let sequence = 0;
  for (const p of [...scene.players]) {
    if (p.riichi && p.melds?.some((m) => m.kind !== "ankan"))
      throw new Error("contradiction_open_riichi");
    if (
      p.riichi &&
      !scene.history.some(
        (h) => h.action.actor === p.actor && h.action.type === "reach",
      )
    ) {
      if (!p.initialHand)
        reserve(p.actor, [
          "1m",
          "2m",
          "3m",
          "4m",
          p.actor === 0 ? "5mr" : "5m",
          "6m",
          "1p",
          "2p",
          "3p",
          "4s",
          "5s",
          TILES[27 + p.actor]!,
          TILES[27 + p.actor]!,
        ]);
      add("tsumo", p.actor, 1, { type: "reach", actor: p.actor });
    }
    for (const meld of p.melds ?? []) {
      const providedKey = `${p.actor}:${meld.kind}`;
      if ((provided.get(providedKey) ?? 0) > 0) {
        provided.set(providedKey, provided.get(providedKey)! - 1);
        continue;
      }
      if (meld.kind === "ankan") {
        if (meld.tiles.length !== 4) throw new Error("contradiction_meld_size");
        reserve(p.actor, meld.tiles);
        add("tsumo", p.actor, 1 + sequence * 3, {
          type: "ankan",
          actor: p.actor,
          consumed: meld.tiles,
        });
        sequence++;
        continue;
      }
      const donor = meld.target ?? (p.actor + 3) % 4;
      if (donor === p.actor) throw new Error("contradiction_call_target");
      const called = meld.tiles[0]!,
        consumed = meld.tiles.slice(1, meld.kind === "kakan" ? 3 : undefined),
        occurrence = 2 + sequence * 3;
      reserve(donor, [called]);
      reserve(p.actor, consumed);
      add("tsumo", donor, occurrence, {
        type: "dahai",
        actor: donor,
        pai: called,
        tsumogiri: false,
      });
      add("dahai", donor, occurrence, {
        type:
          meld.kind === "kakan"
            ? "pon"
            : (meld.kind as "chi" | "pon" | "daiminkan"),
        actor: p.actor,
        target: donor,
        pai: called,
        consumed,
      });
      if (meld.kind === "kakan") {
        const added = meld.tiles[3]!;
        reserve(p.actor, [added]);
        add("tsumo", p.actor, occurrence + 1, {
          type: "kakan",
          actor: p.actor,
          pai: added,
          consumed: [called, ...consumed],
        });
      }
      sequence++;
    }
  }
  // Backward allocation for a requested final self hand. Generated filler discards
  // are explicit history, and fourth-kan / replacement tiles are reserved draws.
  for (const targetPlayer of scene.players) {
    const selfGoals = targetPlayer.melds ?? [],
      targetActor = targetPlayer.actor,
      finalHand =
        targetActor === scene.selfActor
          ? (scene.hand ?? targetPlayer.concealed)
          : targetPlayer.concealed;
    if (finalHand && selfGoals.length && !explicit.has(targetActor)) {
      if (finalHand.length !== 13 - 3 * selfGoals.length)
        throw new Error("contradiction_final_hand_size");
      const owned = [...finalHand],
        usedFillers: string[] = [];
      const wall = scene.wall ?? Array<string | null>(70).fill(null);
      scene.wall = wall;
      const drawAt = (index: number, tile: string) => {
        if (index >= 70 || (wall[index] && wall[index] !== tile))
          throw new Error("contradiction_goal_draw");
        wall[index] = tile;
      };
      for (const meld of selfGoals) {
        const history = scene.history.find(
          (h) => h.action.actor === targetActor && h.action.type === meld.kind,
        )!;
        if (!history) throw new Error("contradiction_missing_goal_history");
        if (meld.kind === "ankan") {
          owned.push(...meld.tiles.slice(0, 3));
          const offset = (targetActor - (scene.round % 4) + 4) % 4;
          drawAt(offset + 4 * (history.after.occurrence - 1), meld.tiles[3]!);
        } else if (meld.kind === "kakan") {
          const pon = scene.history.find(
            (h) => h.action.actor === targetActor && h.action.type === "pon",
          )!;
          const donor = pon.action.target!,
            offsetDonor = (donor - (scene.round % 4) + 4) % 4,
            offsetSelf = (targetActor - (scene.round % 4) + 4) % 4;
          const donorTurn = scene.history.find(
            (h) =>
              h.action.actor === donor &&
              h.action.type === "dahai" &&
              h.action.pai === pon.action.pai,
          )!.after.occurrence;
          const missing = owned.pop()!;
          owned.push(...meld.tiles.slice(1));
          history.after.occurrence =
            donorTurn + (offsetSelf <= offsetDonor ? 1 : 0);
          drawAt(offsetDonor + 4 * (donorTurn - 1) + 4, missing);
          const filler = r
            .shuffle(TILES)
            .find(
              (t) =>
                !owned.includes(t) &&
                !usedFillers.includes(t) &&
                !meld.tiles.includes(t),
            )!;
          owned.push(filler);
          usedFillers.push(filler);
          add("pon", targetActor, 1, {
            type: "dahai",
            actor: targetActor,
            pai: filler,
            tsumogiri: false,
          });
        } else {
          owned.push(...meld.tiles.slice(1));
          if (meld.kind === "chi" || meld.kind === "pon") {
            const filler = r
              .shuffle(TILES)
              .find(
                (t) =>
                  !owned.includes(t) &&
                  !usedFillers.includes(t) &&
                  !meld.tiles.some((m) => m[1] === t[1]),
              )!;
            owned.push(filler);
            usedFillers.push(filler);
            add(
              meld.kind,
              targetActor,
              selfGoals.filter((m) => m.kind === meld.kind).indexOf(meld) + 1,
              {
                type: "dahai",
                actor: targetActor,
                pai: filler,
                tsumogiri: false,
              },
            );
          }
        }
      }
      required.set(targetActor, owned);
    }
  }
  if (required.size) {
    const stock = r.shuffle(
      TILES.flatMap((t) =>
        Array.from({ length: 4 }, (_, i) =>
          t[0] === "5" && t.length === 2 && i === 0 ? `${t}r` : t,
        ),
      ),
    );
    for (const tiles of required.values())
      for (const tile of tiles) {
        const i = stock.indexOf(tile);
        if (i < 0) throw new Error("contradiction_goal_tiles");
        stock.splice(i, 1);
      }
    for (const [actor, tiles] of required) {
      if (tiles.length > 13)
        throw new Error("contradiction_initial_hand_capacity");
      while (tiles.length < 13) tiles.push(stock.pop()!);
      player(actor).initialHand = tiles;
    }
  }
  return scene;
}
function shapedHand(r: Random): string[] {
  // A documented proposal distribution, not an extra rules/eligibility oracle.
  const hand: string[] = [];
  for (let i = 0; i < 3; i++) {
    const s = "mps"[r.int(3)]!,
      n = r.int(7) + 1;
    hand.push(`${n}${s}`, `${n + 1}${s}`, `${n + 2}${s}`);
  }
  const s = "mps"[r.int(3)]!,
    n = r.int(8) + 1;
  hand.push(`${n}${s}`, `${n + 1}${s}`);
  const p = TILES[r.int(34)]!;
  hand.push(p, p);
  for (let replacements = r.int(6); replacements > 0; replacements--)
    hand[r.int(13)] = TILES[r.int(34)]!;
  return hand;
}
export function createBoard(
  scene: ResolvedScene,
  seed: number,
  proposal: "structured" | "tile_shuffle" = "structured",
): LabBoardSpec {
  const r = new Random(seed),
    stock = r.shuffle(
      TILES.flatMap((tile) =>
        Array.from({ length: 4 }, (_, i) =>
          /[5][mps]/.test(tile) && i === 0 ? `${tile}r` : tile,
        ),
      ),
    );
  const hands: (string | null)[][] = Array.from({ length: 4 }, () =>
    Array<string | null>(13).fill(null),
  );
  const yama: (string | null)[] = scene.wall
      ? [...scene.wall]
      : Array(70).fill(null),
    rinshan = scene.rinshan
      ? [...scene.rinshan]
      : Array<string | null>(4).fill(null);
  const doras = Array<string | null>(5).fill(null),
    uras = scene.uraIndicators
      ? [...scene.uraIndicators]
      : Array<string | null>(5).fill(null);
  scene.doraIndicators?.forEach((v, i) => (doras[i] = v));
  for (const p of scene.players)
    if (p.initialHand) hands[p.actor] = [...p.initialHand];
  const hasSelfScript = scene.history.some(
    (h) =>
      h.action.actor === scene.selfActor &&
      ["chi", "pon", "ankan", "daiminkan", "kakan"].includes(h.action.type),
  );
  if (scene.hand && !hasSelfScript) {
    if (scene.hand.length !== 13)
      throw new Error("contradiction_closed_hand_size");
    if (!scene.players.find((p) => p.actor === scene.selfActor)?.initialHand)
      hands[scene.selfActor] = [...scene.hand];
  }
  const proposeSelf =
    !scene.hand &&
    !scene.players.find((p) => p.actor === scene.selfActor)?.initialHand &&
    !hasSelfScript;
  if (scene.draw) {
    const index =
      ((scene.selfActor - (scene.round % 4) + 4) % 4) + 4 * (scene.turn - 1);
    if (index >= 70) throw new Error("contradiction_draw_index");
    if (yama[index] && yama[index] !== scene.draw)
      throw new Error("contradiction_wall_draw");
    yama[index] = scene.draw;
  }
  // Fixed river entries on the no-call skeleton are draw/discard witnesses.
  for (const p of scene.players)
    if (p.river && !scene.history.length) {
      for (let turn = 0; turn < p.river.length; turn++) {
        const i = ((p.actor - (scene.round % 4) + 4) % 4) + 4 * turn;
        if (i >= 70) throw new Error("contradiction_river_length");
        const tile = p.river[turn]!;
        if (yama[i] && yama[i] !== tile)
          throw new Error("contradiction_wall_river");
        yama[i] = tile;
      }
    }
  const all = [...hands, yama, rinshan, doras, uras];
  for (const row of all)
    for (const tile of row)
      if (tile !== null) {
        const i = stock.indexOf(tile);
        if (i < 0) throw new Error("contradiction_tile_conservation");
        stock.splice(i, 1);
      }
  if (proposeSelf) {
    let selected: string[] | null = null;
    for (
      let n = 0;
      n < (proposal === "structured" ? 64 : 0) && !selected;
      n++
    ) {
      const next = shapedHand(r),
        left = [...stock];
      let valid = true;
      for (const tile of next) {
        const i = left.indexOf(tile);
        if (i < 0) {
          valid = false;
          break;
        }
        left.splice(i, 1);
      }
      if (valid) selected = next;
    }
    selected ??= r.shuffle(stock).slice(0, 13);
    for (let i = 0; i < 13; i++) {
      const tile = selected[i]!;
      hands[scene.selfActor]![i] = tile;
      stock.splice(stock.indexOf(tile), 1);
    }
  }
  for (const row of all)
    for (let i = 0; i < row.length; i++)
      if (row[i] === null) row[i] = stock.pop()!;
  return LabBoardSpecSchema.parse({
    kyoku: scene.round,
    honba: scene.honba,
    kyotaku: scene.riichiSticks,
    scores: scene.scores,
    haipai: hands,
    yama,
    rinshan,
    dora_indicators: doras,
    ura_indicators: uras,
  });
}
/** Preserve the base public history while moving tiles only from unobserved stock. */
export function controlledBoard(
  scene: ResolvedScene,
  base: LabBoardSpec,
  baseScene: ResolvedScene,
): LabBoardSpec {
  const board = structuredClone(base);
  board.kyoku = scene.round;
  board.honba = scene.honba;
  board.kyotaku = scene.riichiSticks;
  board.scores = [...scene.scores];
  const zones = [
    ...board.haipai,
    board.yama,
    board.rinshan,
    board.dora_indicators,
    board.ura_indicators,
  ];
  const protectedSlots = new Set<string>(),
    key = (zone: number, i: number) => `${zone}:${i}`;
  const used = Math.min(
    70,
    ((baseScene.selfActor - (baseScene.round % 4) + 4) % 4) +
      4 * (baseScene.turn - 1) +
      1,
  );
  for (let i = 0; i < used; i++) protectedSlots.add(key(4, i));
  for (let i = 0; i < 13; i++) protectedSlots.add(key(baseScene.selfActor, i));
  for (let i = 0; i < (baseScene.doraIndicators?.length ?? 1); i++)
    protectedSlots.add(key(6, i));
  for (const p of baseScene.players)
    if (p.initialHand)
      for (let i = 0; i < 13; i++) protectedSlots.add(key(p.actor, i));
  const assignments: { zone: number; index: number; tile: string }[] = [];
  const set = (zone: number, tiles: readonly (string | null)[]) =>
    tiles.forEach((tile, index) => {
      if (tile !== null) assignments.push({ zone, index, tile });
    });
  if (scene.hand && scene.hand.length === 13) set(scene.selfActor, scene.hand);
  for (const p of scene.players) if (p.initialHand) set(p.actor, p.initialHand);
  if (scene.doraIndicators) set(6, scene.doraIndicators);
  if (scene.draw) {
    const i =
      ((scene.selfActor - (scene.round % 4) + 4) % 4) + 4 * (scene.turn - 1);
    assignments.push({ zone: 4, index: i, tile: scene.draw });
  }
  if (scene.wall) set(4, scene.wall);
  if (scene.rinshan) set(5, scene.rinshan);
  if (scene.uraIndicators) set(7, scene.uraIndicators);
  for (const a of assignments) protectedSlots.delete(key(a.zone, a.index));
  for (const a of assignments) {
    const zone = zones[a.zone]!;
    if (a.index >= zone.length)
      throw new Error("contradiction_controlled_slot");
    if (zone[a.index] !== a.tile) {
      let source: [number, number] | null = null;
      for (let z = 0; z < zones.length && !source; z++)
        for (let i = 0; i < zones[z]!.length; i++)
          if (zones[z]![i] === a.tile && !protectedSlots.has(key(z, i))) {
            source = [z, i];
            break;
          }
      if (!source) throw new Error("contradiction_controlled_tile_unavailable");
      const [z, i] = source;
      [zone[a.index], zones[z]![i]] = [zones[z]![i]!, zone[a.index]!];
    }
    protectedSlots.add(key(a.zone, a.index));
  }
  return LabBoardSpecSchema.parse(board);
}
export function constructionRequest(
  scene: ResolvedScene,
  spec: LabBoardSpec,
  identity: z.infer<typeof LabConstructionIdentitySchema>,
  seed: number,
  maxSteps: number,
): LabConstructRequest {
  const content = {
    protocolVersion: "riichi-lab-construct/v1" as const,
    identity,
    spec,
    selfActor: scene.selfActor,
    turn: scene.turn,
    maxSteps,
    script: scene.history,
    seed,
  };
  return LabConstructRequestSchema.parse({
    ...content,
    requestId: digest(content),
  });
}
