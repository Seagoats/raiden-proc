/** The hangar profile, persisted in localStorage. */
import { newId, setNextId, Rarity, type Item } from "./items";
import type { Loadout } from "./stats";
import { volume, applyVolume } from "../core/audio";

export interface Profile {
  version: 2;
  stash: Item[];
  loadout: Loadout;
  /** Highest unlocked tier: 0 Normal, n = Hell n. */
  unlocked: number;
  tier: number;
  /** Level ids cleared on Normal ("1-1"...). */
  cleared: string[];
  /** Last level chosen on the map. */
  level: string;
  best: Record<string, number>;
  options: { shotAlpha: number; music: number; sfx: number; crt: boolean };
  sorties: number;
}

const KEY = "raidenproc.profile.v2";

function fresh(): Profile {
  // The starter kit is deliberately plain: one gun, an empty ordnance rail, slow engines.
  const mk = (base: string): Item => ({ id: newId(), base, ilvl: 1, rarity: Rarity.Common, seed: Math.floor(Math.random() * 2 ** 31) });
  const [hull, wings, engine, gun, bomb] = ["falcon", "trainwing", "cruise", "vulcan", "nuke"].map(mk);
  hull.seed = 1; // Starter hull wears the red chassis palette.
  return {
    version: 2,
    stash: [hull, wings, engine, gun, bomb],
    loadout: { hull: hull.id, wings: wings.id, engine: engine.id, main: [gun.id, null, null], ord: [null, null, null], bomb: bomb.id },
    unlocked: 0,
    tier: 0,
    cleared: [],
    level: "1-1",
    best: {},
    options: { shotAlpha: 0.6, music: 0.5, sfx: 0.7, crt: false },
    sorties: 0,
  };
}

export let profile: Profile = load();

function load(): Profile {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const p = JSON.parse(raw) as Profile;
      // v1 saves predate the campaign and its tuning; they start over.
      if (p.version === 2 && Array.isArray(p.stash)) {
        setNextId(Math.max(0, ...p.stash.map((i) => i.id)));
        return { ...fresh(), ...p, options: { ...fresh().options, ...p.options } };
      }
    }
  } catch {
    // Storage unavailable or corrupt: start fresh.
  }
  return fresh();
}

export function save() {
  try {
    localStorage.setItem(KEY, JSON.stringify(profile));
  } catch {
    // Not persisting is survivable.
  }
}

export function resetProfile() {
  profile = fresh();
  save();
}

export function syncOptions() {
  volume.music = profile.options.music;
  volume.sfx = profile.options.sfx;
  applyVolume();
}

export const stashMap = () => new Map(profile.stash.map((i) => [i.id, i]));
