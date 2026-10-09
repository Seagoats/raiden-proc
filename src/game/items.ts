/**
 * Loot. Every item is fully defined by (base, ilvl, rarity, seed); its affixes
 * are re-derived from the seed, so saves stay tiny and builds are shareable.
 */
import { hash, irange, mulberry32, pick, range, weighted, type Rng } from "../core/rng";

export type Slot = "hull" | "wings" | "engine" | "main" | "ord" | "bomb";
export const Rarity = { Common: 0, Magic: 1, Rare: 2, Unique: 3 } as const;
export type Rarity = 0 | 1 | 2 | 3;
export const RARITY_NAME = ["Common", "Magic", "Rare", "Unique"];
export const RARITY_COLOR = ["#d8d8d8", "#7898ff", "#ffe050", "#ff9838"];

export interface Item {
  id: number;
  base: string;
  ilvl: number;
  rarity: Rarity;
  seed: number;
  /** Uniques: which unique. */
  unique?: string;
}

export type WeaponType = "vulcan" | "laser" | "plasma" | "dumbfire" | "homing";
export type BombType = "nuke" | "cluster";

export interface BaseDef {
  slot: Slot;
  name: string;
  energy: number;
  icon: number;
  // hull
  size?: number; hp?: number; shields?: number; hitbox?: number; capacity?: number;
  // wings
  style?: number; mains?: number; ords?: number; precision?: number;
  // engines
  power?: number; lat?: number; vert?: number;
  // weapons
  weapon?: WeaponType; amount?: number; spread?: number; damage?: number; rate?: number; speed?: number; pierce?: number;
  // bombs
  bomb?: BombType; stock?: number;
}

export const BASES: Record<string, BaseDef> = {
  wasp: { slot: "hull", name: "Wasp Frame", icon: 0, energy: 0, size: 0, capacity: 11, hp: 2, shields: 1, hitbox: 1.5 },
  falcon: { slot: "hull", name: "Falcon Frame", icon: 0, energy: 0, size: 1, capacity: 14, hp: 4, shields: 1, hitbox: 2.5 },
  bastion: { slot: "hull", name: "Bastion Frame", icon: 0, energy: 0, size: 2, capacity: 18, hp: 6, shields: 2, hitbox: 3.5 },
  gunwing: { slot: "wings", name: "Gunship Wings", icon: 1, energy: 2, style: 0, mains: 3, ords: 0, precision: 1.15 },
  balwing: { slot: "wings", name: "Balanced Wings", icon: 1, energy: 2, style: 1, mains: 2, ords: 1, precision: 1.0 },
  bomwing: { slot: "wings", name: "Bomber Wings", icon: 1, energy: 2, style: 2, mains: 1, ords: 3, precision: 0.9 },
  sprint: { slot: "engine", name: "Sprint Thruster", icon: 2, energy: 1, power: 0, lat: 2.7, vert: 1.9 },
  cruise: { slot: "engine", name: "Cruise Twin", icon: 2, energy: 2, power: 1, lat: 2.4, vert: 2.4 },
  burner: { slot: "engine", name: "Afterburner Quad", icon: 2, energy: 4, power: 2, lat: 3.1, vert: 2.7 },
  vulcan: { slot: "main", name: "Vulcan", icon: 3, energy: 2, weapon: "vulcan", amount: 3, spread: 22, damage: 4, rate: 12, speed: 9, pierce: 0 },
  laser: { slot: "main", name: "Laser", icon: 4, energy: 3, weapon: "laser", amount: 1, spread: 0, damage: 2.6, rate: 22, speed: 13, pierce: 2 },
  plasma: { slot: "main", name: "Plasma", icon: 5, energy: 4, weapon: "plasma", amount: 1, spread: 0, damage: 50, rate: 1, speed: 0, pierce: 0 },
  dumbfire: { slot: "ord", name: "Dumbfire Rockets", icon: 6, energy: 2, weapon: "dumbfire", amount: 2, spread: 0, damage: 16, rate: 1.7, speed: 6, pierce: 0 },
  homing: { slot: "ord", name: "Homing Missiles", icon: 7, energy: 3, weapon: "homing", amount: 2, spread: 0, damage: 9, rate: 1.9, speed: 4.5, pierce: 0 },
  nuke: { slot: "bomb", name: "Nuke", icon: 8, energy: 1, bomb: "nuke", stock: 2 },
  cluster: { slot: "bomb", name: "Cluster Bomb", icon: 8, energy: 1, bomb: "cluster", stock: 3 },
};
export const BASE_IDS = Object.keys(BASES);

// ---------------------------------------------------------------- affixes

/** How a modifier combines: flat adds to the base; inc adds within its layer; more multiplies. */
export type ModKind = "flat" | "inc" | "more" | "flag";
export interface Mod { stat: string; kind: ModKind; value: number }

interface AffixDef {
  id: string;
  slots: Slot[];
  weight: number;
  stat: string;
  kind: ModKind;
  /** Roll a value for an item level. */
  roll: (r: Rng, ilvl: number) => number;
  text: (v: number) => string;
  prefix: string;
  suffix: string;
  minIlvl?: number;
}

const tier = (ilvl: number) => 1 + ilvl / 12;
const pct = (r: Rng, lo: number, hi: number, ilvl: number) => Math.round(range(r, lo, hi) * tier(ilvl));
const W: Slot[] = ["main", "ord"];

export const AFFIXES: AffixDef[] = [
  // Weapon-local.
  { id: "amount", slots: W, weight: 10, stat: "amount", kind: "flat", prefix: "Hydra", suffix: "of Plenty",
    roll: (r, l) => (r() < 0.03 ? 10 : irange(r, 1, l >= 15 ? 4 : l >= 6 ? 3 : 2)), text: (v) => `AMOUNT +${v}` },
  { id: "damage", slots: W, weight: 10, stat: "damage", kind: "inc", prefix: "Searing", suffix: "of Ruin",
    roll: (r, l) => pct(r, 10, 40, l), text: (v) => `+${v}% DAMAGE` },
  { id: "rate", slots: W, weight: 10, stat: "rate", kind: "inc", prefix: "Rapid", suffix: "of Haste",
    roll: (r, l) => pct(r, 10, 35, l), text: (v) => `+${v}% FIRE RATE` },
  { id: "spread", slots: ["main"], weight: 6, stat: "spread", kind: "inc", prefix: "Wide", suffix: "of the Fan",
    roll: (r, l) => pct(r, 20, 60, l), text: (v) => `+${v}% SPREAD` },
  { id: "speed", slots: W, weight: 5, stat: "speed", kind: "inc", prefix: "Swift", suffix: "of Velocity",
    roll: (r, l) => pct(r, 10, 40, l), text: (v) => `+${v}% SHOT SPEED` },
  { id: "pierce", slots: W, weight: 6, stat: "pierce", kind: "flat", prefix: "Lancing", suffix: "of Piercing",
    roll: (r) => irange(r, 1, 2), text: (v) => `PIERCE +${v}` },
  { id: "split", slots: ["main"], weight: 3, stat: "split", kind: "flat", prefix: "Fractal", suffix: "of Shards", minIlvl: 4,
    roll: (r) => irange(r, 2, 4), text: (v) => `KILLS SPLIT INTO ${v} SHOTS` },
  // Global part affixes.
  { id: "g_amount", slots: ["wings", "hull"], weight: 4, stat: "g_amount", kind: "flat", prefix: "Legion", suffix: "of Multitudes", minIlvl: 3,
    roll: (r, l) => (l >= 12 ? irange(r, 1, 2) : 1), text: (v) => `+${v} AMOUNT TO ALL WEAPONS` },
  { id: "g_damage", slots: ["wings", "hull", "engine"], weight: 8, stat: "g_damage", kind: "inc", prefix: "Brutal", suffix: "of Wrath",
    roll: (r, l) => pct(r, 8, 25, l), text: (v) => `+${v}% DAMAGE (ALL)` },
  { id: "g_rate", slots: ["wings", "hull", "engine"], weight: 8, stat: "g_rate", kind: "inc", prefix: "Frenzied", suffix: "of Fury",
    roll: (r, l) => pct(r, 6, 20, l), text: (v) => `ALL COOLDOWNS -${v}%` },
  { id: "elite", slots: ["wings", "hull", "main", "ord"], weight: 5, stat: "elite", kind: "inc", prefix: "Giantslayer", suffix: "of the Hunt",
    roll: (r, l) => pct(r, 20, 60, l), text: (v) => `+${v}% DAMAGE VS ELITES` },
  { id: "mf", slots: ["hull", "engine", "wings"], weight: 5, stat: "mf", kind: "inc", prefix: "Lucky", suffix: "of Fortune",
    roll: (r, l) => pct(r, 10, 35, l), text: (v) => `+${v}% MAGIC FIND` },
  // Defensive.
  { id: "shields", slots: ["hull"], weight: 6, stat: "shields", kind: "flat", prefix: "Warded", suffix: "of the Aegis",
    roll: () => 1, text: (v) => `+${v} SHIELD CHARGE` },
  { id: "recharge", slots: ["hull", "engine"], weight: 6, stat: "recharge", kind: "inc", prefix: "Restoring", suffix: "of Renewal",
    roll: (r, l) => pct(r, 15, 40, l), text: (v) => `+${v}% SHIELD RECHARGE` },
  { id: "shockwave", slots: ["hull"], weight: 3, stat: "shockwave", kind: "flag", prefix: "Thundering", suffix: "of Shockwaves",
    roll: () => 1, text: () => `SHIELD BREAK CLEARS BULLETS` },
  { id: "hits", slots: ["hull"], weight: 1, stat: "hits", kind: "flat", prefix: "Undying", suffix: "of Endurance", minIlvl: 5,
    roll: () => 1, text: (v) => `+${v} HIT` },
  { id: "killburst", slots: ["hull", "wings"], weight: 3, stat: "killburst", kind: "inc", prefix: "Vengeful", suffix: "of Retribution", minIlvl: 3,
    roll: (r, l) => pct(r, 6, 15, l), text: (v) => `KILLS: ${v}% CHANCE TO FIRE A BURST` },
  // Movement.
  { id: "lat", slots: ["engine", "wings"], weight: 7, stat: "lat", kind: "inc", prefix: "Darting", suffix: "of Evasion",
    roll: (r, l) => pct(r, 8, 22, l), text: (v) => `+${v}% LATERAL SPEED` },
  { id: "vert", slots: ["engine"], weight: 5, stat: "vert", kind: "inc", prefix: "Surging", suffix: "of the Climb",
    roll: (r, l) => pct(r, 8, 22, l), text: (v) => `+${v}% VERTICAL SPEED` },
  { id: "precision", slots: ["engine", "wings"], weight: 4, stat: "precision", kind: "inc", prefix: "Steady", suffix: "of Finesse",
    roll: (r, l) => pct(r, 10, 30, l), text: (v) => `+${v}% PRECISION SPEED` },
  // Bombs.
  { id: "stock", slots: ["bomb"], weight: 10, stat: "stock", kind: "flat", prefix: "Stocked", suffix: "of Supply",
    roll: (r) => irange(r, 1, 2), text: (v) => `+${v} BOMB STOCK` },
  { id: "bmedals", slots: ["bomb"], weight: 5, stat: "bmedals", kind: "flag", prefix: "Gilded", suffix: "of Alchemy",
    roll: () => 1, text: () => `CLEARED BULLETS BECOME MEDALS` },
  { id: "bshield", slots: ["bomb"], weight: 5, stat: "bshield", kind: "flag", prefix: "Guardian", suffix: "of Shelter",
    roll: () => 1, text: () => `BOMBS RESTORE A SHIELD CHARGE` },
  { id: "bfield", slots: ["bomb"], weight: 5, stat: "bfield", kind: "flag", prefix: "Scorching", suffix: "of Embers",
    roll: () => 1, text: () => `BOMBS LEAVE A DAMAGING FIELD` },
  { id: "bdamage", slots: ["bomb"], weight: 6, stat: "bdamage", kind: "inc", prefix: "Cataclysmic", suffix: "of Annihilation",
    roll: (r, l) => pct(r, 30, 80, l), text: (v) => `+${v}% BOMB DAMAGE` },
];

// ---------------------------------------------------------------- uniques

export interface UniqueDef {
  id: string;
  name: string;
  base: string;
  minTier: number;
  mods: Mod[];
  lines: string[];
  effect: string;
}

export const UNIQUES: UniqueDef[] = [
  { id: "hydra", name: "Hydra's Maw", base: "vulcan", minTier: 0,
    mods: [{ stat: "amount", kind: "flat", value: 8 }, { stat: "spread", kind: "inc", value: 90 }, { stat: "damage", kind: "more", value: -35 }, { stat: "split", kind: "flat", value: 3 }],
    lines: ["AMOUNT +8", "+90% SPREAD", "35% LESS DAMAGE"], effect: "KILLS SPLIT INTO 3 SHOTS" },
  { id: "heartseeker", name: "Heartseeker", base: "homing", minTier: 0,
    mods: [{ stat: "amount", kind: "flat", value: 4 }, { stat: "rate", kind: "inc", value: 60 }, { stat: "pierce", kind: "flat", value: 2 }],
    lines: ["AMOUNT +4", "+60% FIRE RATE"], effect: "MISSILES PIERCE AND RETARGET" },
  { id: "aegis", name: "Aegis Spine", base: "falcon", minTier: 0,
    mods: [{ stat: "shields", kind: "flat", value: 2 }, { stat: "shockwave", kind: "flag", value: 1 }, { stat: "shieldburst", kind: "flag", value: 1 }],
    lines: ["+2 SHIELD CHARGES", "SHIELD BREAK CLEARS BULLETS"], effect: "SHIELD BREAKS FIRE A HOMING SWARM" },
  { id: "thunderhead", name: "Thunderhead", base: "laser", minTier: 2,
    mods: [{ stat: "amount", kind: "flat", value: 2 }, { stat: "pierce", kind: "flat", value: 99 }, { stat: "damage", kind: "more", value: 40 }],
    lines: ["AMOUNT +2", "40% MORE DAMAGE"], effect: "LASERS PIERCE EVERYTHING" },
  { id: "sunfall", name: "Sunfall", base: "nuke", minTier: 1,
    mods: [{ stat: "stock", kind: "flat", value: 2 }, { stat: "bmedals", kind: "flag", value: 1 }, { stat: "bfield", kind: "flag", value: 1 }, { stat: "bdamage", kind: "inc", value: 150 }],
    lines: ["+2 BOMB STOCK", "+150% BOMB DAMAGE", "CLEARED BULLETS BECOME MEDALS"], effect: "BOMBS LEAVE A DAMAGING FIELD" },
  { id: "zephyr", name: "Zephyr Coil", base: "burner", minTier: 1,
    mods: [{ stat: "lat", kind: "inc", value: 40 }, { stat: "g_rate", kind: "inc", value: 30 }, { stat: "g_amount", kind: "flat", value: 1 }],
    lines: ["+40% LATERAL SPEED", "ALL COOLDOWNS -30%"], effect: "+1 AMOUNT TO ALL WEAPONS" },
];

// ---------------------------------------------------------------- rolled view of an item

export interface Rolled {
  item: Item;
  def: BaseDef;
  name: string;
  mods: Mod[];
  lines: string[];
  effect?: string;
  /** Base-stat multiplier from item level. */
  levelMul: number;
}

const RARE_A = ["Storm", "Ash", "Grim", "Iron", "Void", "Sun", "Rift", "Nova", "Dread", "Hex", "Blood", "Cinder", "Gale", "Bone"];
const RARE_B = ["Talon", "Gyre", "Spire", "Fang", "Wake", "Song", "Brand", "Heart", "Shroud", "Coil", "Veil", "Maw", "Edge", "Crown"];

const rolledCache = new Map<string, Rolled>();

export function roll(item: Item): Rolled {
  const key = `${item.base}.${item.ilvl}.${item.rarity}.${item.seed}.${item.unique ?? ""}`;
  const hit = rolledCache.get(key);
  if (hit) return { ...hit, item };
  const def = BASES[item.base];
  const levelMul = 1 + 0.07 * (item.ilvl - 1);
  let out: Rolled;
  if (item.rarity === Rarity.Unique && item.unique) {
    const u = UNIQUES.find((x) => x.id === item.unique)!;
    out = { item, def, name: u.name, mods: u.mods, lines: [...u.lines], effect: u.effect, levelMul };
  } else {
    const r = mulberry32(hash(item.seed, item.ilvl, item.rarity));
    const count = item.rarity === Rarity.Magic ? irange(r, 1, 2) : item.rarity === Rarity.Rare ? irange(r, 3, 4) : 0;
    const pool = AFFIXES.filter((a) => a.slots.includes(def.slot) && (a.minIlvl ?? 0) <= item.ilvl);
    const chosen: AffixDef[] = [];
    while (chosen.length < count && chosen.length < pool.length) {
      const a = weighted(r, pool.filter((p) => !chosen.includes(p)).map((p) => [p, p.weight] as [AffixDef, number]));
      chosen.push(a);
    }
    const mods: Mod[] = [];
    const lines: string[] = [];
    for (const a of chosen) {
      const v = a.roll(r, item.ilvl);
      mods.push({ stat: a.stat, kind: a.kind, value: v });
      lines.push(a.text(v));
    }
    let name = def.name;
    if (item.rarity === Rarity.Magic) {
      name = `${chosen[0].prefix} ${def.name}${chosen[1] ? " " + chosen[1].suffix : ""}`;
    } else if (item.rarity === Rarity.Rare) {
      name = `${pick(r, RARE_A)} ${pick(r, RARE_B)}`;
    }
    out = { item, def, name, mods, lines, levelMul };
  }
  rolledCache.set(key, out);
  return out;
}

/** Display name: rares show their base underneath, so return both. */
export function displayName(item: Item): string {
  return roll(item).name;
}

// ---------------------------------------------------------------- drops

let nextId = Date.now() % 1e9;
export function setNextId(n: number) { nextId = Math.max(nextId, n); }
export function newId() { return ++nextId; }

export interface DropContext { ilvl: number; tier: number; mf: number; bonusRarity?: number; slotBias?: Slot[] }

/** Roll a fresh item drop. */
export function rollDrop(r: Rng, ctx: DropContext): Item {
  const mf = 1 + ctx.mf / 100;
  const rarity = weighted<Rarity>(r, [
    [Rarity.Common, 60 / mf],
    [Rarity.Magic, 32],
    [Rarity.Rare, 9 * mf + (ctx.bonusRarity ?? 0) * 10],
    [Rarity.Unique, (0.9 + ctx.tier * 0.5) * mf + (ctx.bonusRarity ?? 0) * 2],
  ]);
  const seed = Math.floor(r() * 2 ** 31);
  if (rarity === Rarity.Unique) {
    const avail = UNIQUES.filter((u) => u.minTier <= ctx.tier);
    const u = pick(r, avail);
    return { id: newId(), base: u.base, ilvl: ctx.ilvl, rarity, seed, unique: u.id };
  }
  // Weapons drop more often than frames.
  const base = weighted<string>(r, BASE_IDS.map((b) => {
    const s = BASES[b].slot;
    const w = s === "main" ? 5 : s === "ord" ? 4 : s === "bomb" ? 1.5 : 2.5;
    return [b, ctx.slotBias?.includes(s) ? w * 2 : w];
  }));
  return { id: newId(), base, ilvl: ctx.ilvl, rarity, seed };
}

export function shareCode(item: Item): string {
  return [BASE_IDS.indexOf(item.base), item.ilvl, item.rarity, item.seed, item.unique ? UNIQUES.findIndex((u) => u.id === item.unique) : ""]
    .map((v) => (typeof v === "number" ? v.toString(36) : v)).join("-").toUpperCase();
}
