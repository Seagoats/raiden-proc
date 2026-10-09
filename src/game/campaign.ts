/**
 * The campaign: four biomes of three levels each, the difficulty curve that
 * ramps across them, and unlock rules. Level 1 should feel like the first
 * dungeon of a looter: slow, gentle, sparse. Space and Hell open up later.
 */
import { mulberry32, type Rng } from "../core/rng";

export interface Biome {
  id: number;
  name: string;
  /** Teaser shown on the map. */
  blurb: string;
  /** Hue family for the Graftwing squadrons in this biome. */
  hues: number[];
  carrier: boolean;
  boss: "leviathan" | "serpent" | "fortress" | "core";
}

export const BIOMES: Biome[] = [
  { id: 1, name: "COASTAL LAUNCH", blurb: "THE FLEET'S FIRST LINE", hues: [0, 18, 75], carrier: true, boss: "leviathan" },
  { id: 2, name: "VOLCANIC SEA", blurb: "WATCH THE WATER", hues: [25, 35, 10], carrier: true, boss: "serpent" },
  { id: 3, name: "SKY FORTRESS", blurb: "ENEMY R&D ABOVE THE CLOUDS", hues: [200, 345, 180], carrier: true, boss: "fortress" },
  { id: 4, name: "ORBIT", blurb: "EVERYTHING AT ONCE", hues: [280, 300, 190], carrier: false, boss: "core" },
];

export interface Level {
  id: string;
  biome: number;
  n: 1 | 2 | 3;
  /** 0..11 across the campaign. */
  index: number;
  name: string;
  desc: string;
  /** Background strips in order; the last entry of `loop` repeats for the boss. */
  strips: string[];
  loop: string;
  /** What the level teaches (drives the wave generator). */
  twist: "none" | "flank" | "spouts" | "erupt" | "affix1" | "affix2" | "omni";
}

const L = (biome: number, n: 1 | 2 | 3, name: string, desc: string, strips: string[], loop: string, twist: Level["twist"]): Level => ({
  id: `${biome}-${n}`, biome, n, index: (biome - 1) * 3 + n - 1, name, desc, strips, loop, twist,
});

export const LEVELS: Level[] = [
  L(1, 1, "FIRST SORTIE", "TOP-ENTRY WAVES", ["bg_01", "bg_02", "bg_03", "bg_01"], "bg_01", "none"),
  L(1, 2, "FLANKING ASSAULT", "ENEMIES FROM THE SIDES AND BEHIND", ["bg_01", "bg_04", "bg_05", "bg_02"], "bg_02", "flank"),
  L(1, 3, "STORM FRONT", "BOSS: LEVIATHAN GUNSHIP", ["bg_01", "bg_05", "bg_06", "bg_07"], "bg_07", "flank"),
  L(2, 1, "ASH TIDE", "WATER AND LAVA SPOUTS", ["b2_01", "b2_02", "b2_01", "b2_03"], "b2_01", "spouts"),
  L(2, 2, "MAGMA REEF", "ENEMIES ERUPT FROM BELOW", ["b2_01", "b2_03", "b2_04", "b2_02"], "b2_01", "erupt"),
  L(2, 3, "BOILING SEA", "BOSS: MAGMA SERPENT", ["b2_01", "b2_04", "b2_02", "b2_05"], "b2_05", "erupt"),
  L(3, 1, "CLOUD LINE", "ENEMIES CARRY AFFIXES", ["b3_01", "b3_02", "b3_01", "b3_03"], "b3_01", "affix1"),
  L(3, 2, "TEST RANGE", "AFFIX COMBOS", ["b3_01", "b3_03", "b3_04", "b3_02"], "b3_01", "affix2"),
  L(3, 3, "FORTRESS HEART", "BOSS: FORTRESS CORE", ["b3_01", "b3_04", "b3_02", "b3_05"], "b3_05", "affix2"),
  L(4, 1, "DEBRIS FIELD", "THREATS FROM EVERY SIDE", ["b4_01", "b4_02", "b4_01", "b4_03"], "b4_01", "omni"),
  L(4, 2, "CRYSTAL BELT", "AFFIXED WAVES", ["b4_01", "b4_03", "b4_04", "b4_02"], "b4_01", "omni"),
  L(4, 3, "THE CORE", "FINAL BOSS", ["b4_01", "b4_04", "b4_02", "b4_05"], "b4_05", "omni"),
];

export const levelById = (id: string) => LEVELS.find((l) => l.id === id) ?? LEVELS[0];
export const biomeOf = (l: Level) => BIOMES[l.biome - 1];

// ---------------------------------------------------------------- difficulty

export interface Difficulty {
  /** Effective depth: the campaign index, or deeper for Hell tiers. */
  D: number;
  hpMul: number;
  /** Enemy fire frequency multiplier (periods are divided by it). */
  fireMul: number;
  /** Bullets per fan/ring multiplier. */
  density: number;
  bspeed: number;
  /** Air enemy movement speed multiplier. */
  speedMul: number;
  /** Wave frequency multiplier. */
  spawnMul: number;
  affixChance: number;
  maxAffixes: number;
  /** Items the level can drop in total (the boss always takes one). */
  lootBudget: number;
  /** Chance per elite kill to drop an item while budget remains. */
  eliteLoot: number;
  rollIlvl: (r: Rng) => number;
}

export function difficulty(level: Level, tier: number): Difficulty {
  const D = tier > 0 ? 11 + 2.5 * tier : level.index;
  const d = Math.min(D / 11, 1.6);
  let affixChance = 0, maxAffixes = 0;
  if (tier > 0) { affixChance = Math.min(0.15 + 0.1 * tier, 0.7); maxAffixes = Math.min(tier + 1, 3); }
  else if (level.twist === "affix1") { affixChance = 0.15; maxAffixes = 1; }
  else if (level.twist === "affix2") { affixChance = 0.25; maxAffixes = 2; }
  else if (level.biome === 4) { affixChance = 0.25; maxAffixes = 2; }
  return {
    D,
    hpMul: 1.22 ** D,
    fireMul: 0.55 + 0.6 * d,
    density: 0.5 + 0.7 * d,
    bspeed: 0.75 + 0.35 * d,
    speedMul: 0.85 + 0.3 * d,
    spawnMul: 0.7 + 0.6 * d,
    affixChance,
    maxAffixes,
    lootBudget: tier > 0 ? 3 : 2,
    eliteLoot: tier > 0 ? 0.12 : 0.08,
    rollIlvl: (r) => (tier > 0 ? 12 + 3 * tier + Math.floor(r() * 3) : 1 + level.index + (r() < 0.4 ? 1 : 0)),
  };
}

// ---------------------------------------------------------------- unlocks

export function isUnlocked(level: Level, cleared: string[]): boolean {
  return level.index === 0 || cleared.includes(LEVELS[level.index - 1].id);
}
export const biomeUnlocked = (b: Biome, cleared: string[]) => isUnlocked(LEVELS[(b.id - 1) * 3], cleared);
export const hellUnlocked = (cleared: string[]) => cleared.includes("4-3");

/** A stable seed per level so wave layouts are learnable; Hell tiers remix them. */
export const levelSeed = (level: Level, tier: number) => mulberry32(level.index * 7919 + tier * 104729 + 17);
