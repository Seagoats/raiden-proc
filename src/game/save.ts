/** The hangar profile, persisted in localStorage. */
import { newId, setNextId, Rarity, type Item } from "./items";
import type { Loadout } from "./stats";
import { volume, applyVolume } from "../core/audio";

export interface Profile {
  version: 1;
  stash: Item[];
  loadout: Loadout;
  /** Highest unlocked tier: 0 Normal, n = Hell n. */
  unlocked: number;
  tier: number;
  best: Record<string, number>;
  options: { shotAlpha: number; music: number; sfx: number; crt: boolean };
  sorties: number;
}

const KEY = "raidenproc.profile.v1";

function fresh(): Profile {
  const mk = (base: string, rarity: Rarity = Rarity.Common, seed = Math.floor(Math.random() * 2 ** 31)): Item => ({ id: newId(), base, ilvl: 1, rarity, seed });
  const starter = [mk("falcon", Rarity.Common, 1), mk("balwing"), mk("cruise"), mk("vulcan"), mk("vulcan"), mk("dumbfire"), mk("nuke")];
  const extras = [mk("laser", Rarity.Magic), mk("wasp", Rarity.Magic, 2), mk("gunwing", Rarity.Magic), mk("homing", Rarity.Magic), mk("plasma"), mk("sprint")];
  const [hull, wings, engine, v1, v2, df, nuke] = starter;
  return {
    version: 1,
    stash: [...starter, ...extras],
    loadout: { hull: hull.id, wings: wings.id, engine: engine.id, main: [v1.id, v2.id, null], ord: [df.id, null, null], bomb: nuke.id },
    unlocked: 0,
    tier: 0,
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
      if (p.version === 1 && Array.isArray(p.stash)) {
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
