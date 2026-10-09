/**
 * The stat pipeline. Layers, in order: weapon base stats, weapon affixes, part
 * (global) affixes, in-run P levels and drafts. "inc" modifiers add within a
 * layer; layers multiply; "more" modifiers always multiply.
 */
import { BASES, roll, type BombType, type Item, type Mod, type WeaponType } from "./items";
import type { PlayerLook } from "../gfx/sprites";

export interface Loadout {
  hull: number | null;
  wings: number | null;
  engine: number | null;
  main: (number | null)[];
  ord: (number | null)[];
  bomb: number | null;
}

export interface RunMods {
  p: number;
  mods: Mod[];
}

export interface WeaponStats {
  type: WeaponType;
  mount: "main" | "ord";
  slot: number;
  amount: number;
  spread: number;
  damage: number;
  rate: number;
  speed: number;
  pierce: number;
  split: number;
  elite: number;
  flags: Set<string>;
}

export interface Build {
  energyCap: number;
  energyUsed: number;
  complete: boolean;
  valid: boolean;
  hp: number;
  shields: number;
  recharge: number;
  hitbox: number;
  lat: number;
  vert: number;
  precision: number;
  weapons: WeaponStats[];
  bomb: { type: BombType; stock: number; damage: number; flags: Set<string> } | null;
  killburst: number;
  flags: Set<string>;
  look: PlayerLook;
  mainSlots: number;
  ordSlots: number;
}

const HUES = [0, 215, 130, 45, 280];

class Layer {
  flat = new Map<string, number>();
  inc = new Map<string, number>();
  more = new Map<string, number>();
  flags = new Set<string>();
  add(m: Mod) {
    if (m.kind === "flag") this.flags.add(m.stat);
    else if (m.kind === "more") this.more.set(m.stat, (this.more.get(m.stat) ?? 1) * (1 + m.value / 100));
    else (m.kind === "flat" ? this.flat : this.inc).set(m.stat, ((m.kind === "flat" ? this.flat : this.inc).get(m.stat) ?? 0) + m.value);
  }
  f(s: string) { return this.flat.get(s) ?? 0; }
  i(s: string) { return 1 + (this.inc.get(s) ?? 0) / 100; }
  m(s: string) { return this.more.get(s) ?? 1; }
}

/** Extra amount from P level, per weapon type. */
function pAmount(t: WeaponType, p: number) {
  return t === "vulcan" ? Math.floor((p - 1) / 2) : t === "dumbfire" || t === "homing" ? Math.floor((p - 1) / 3) : Math.floor((p - 1) / 3);
}

export function computeBuild(stash: Map<number, Item>, lo: Loadout, run: RunMods = { p: 1, mods: [] }): Build {
  const get = (id: number | null) => (id != null ? stash.get(id) ?? null : null);
  const hull = get(lo.hull), wings = get(lo.wings), engine = get(lo.engine), bombItem = get(lo.bomb);
  const parts = new Layer();
  for (const it of [hull, wings, engine]) if (it) roll(it).mods.forEach((m) => parts.add(m));
  const runL = new Layer();
  run.mods.forEach((m) => runL.add(m));

  const hd = hull ? BASES[hull.base] : null;
  const wd = wings ? BASES[wings.base] : null;
  const ed = engine ? BASES[engine.base] : null;
  const mainSlots = wd?.mains ?? 0;
  const ordSlots = wd?.ords ?? 0;

  let energyUsed = 0;
  for (const it of [wings, engine, bombItem]) if (it) energyUsed += BASES[it.base].energy;

  const weapons: WeaponStats[] = [];
  const addWeapon = (id: number | null, mount: "main" | "ord", slot: number) => {
    const it = get(id);
    if (!it) return;
    const r = roll(it);
    const d = r.def;
    energyUsed += d.energy;
    const wl = new Layer();
    r.mods.forEach((m) => wl.add(m));
    const t = d.weapon!;
    const extraRun = (s: string) => runL.f(s) + (t === "laser" ? runL.f(`laser_${s}`) : 0) + (mount === "ord" ? runL.f(`missile_${s}`) : 0);
    const amount = Math.max(1, Math.round(d.amount! + wl.f("amount") + parts.f("g_amount") + extraRun("amount") + pAmount(t, run.p)));
    const dmg = d.damage! * r.levelMul * wl.i("damage") * parts.i("g_damage") * runL.i("damage") * (1 + 0.08 * (run.p - 1)) * wl.m("damage") * parts.m("g_damage");
    const rate = d.rate! * wl.i("rate") * parts.i("g_rate") * runL.i("rate") * wl.m("rate");
    weapons.push({
      type: t, mount, slot, amount,
      spread: d.spread! * wl.i("spread") * runL.i("spread"),
      damage: dmg,
      rate,
      speed: d.speed! * wl.i("speed") * runL.i("speed"),
      pierce: d.pierce! + wl.f("pierce") + extraRun("pierce"),
      split: wl.f("split"),
      elite: (wl.inc.get("elite") ?? 0) + (parts.inc.get("elite") ?? 0),
      flags: wl.flags,
    });
  };
  lo.main.slice(0, mainSlots).forEach((id, i) => addWeapon(id, "main", i));
  lo.ord.slice(0, ordSlots).forEach((id, i) => addWeapon(id, "ord", i));

  let bomb: Build["bomb"] = null;
  if (bombItem) {
    const r = roll(bombItem);
    const bl = new Layer();
    r.mods.forEach((m) => bl.add(m));
    bomb = { type: r.def.bomb!, stock: r.def.stock! + bl.f("stock"), damage: 220 * r.levelMul * bl.i("bdamage"), flags: bl.flags };
  }

  const hullR = hull ? roll(hull) : null;
  const energyCap = hd ? hd.capacity! + Math.floor((hull!.ilvl - 1) / 4) : 0;
  const complete = !!(hull && wings && engine);
  const hueSeed = hull ? hull.seed : 0;
  return {
    energyCap,
    energyUsed,
    complete,
    valid: complete && energyUsed <= energyCap,
    hp: (hd?.hp ?? 3) + parts.f("hits"),
    shields: (hd?.shields ?? 0) + parts.f("shields") + runL.f("shields"),
    recharge: 12 / parts.i("recharge"),
    hitbox: hd?.hitbox ?? 2.5,
    lat: (ed?.lat ?? 2.2) * parts.i("lat") * runL.i("lat"),
    vert: (ed?.vert ?? 2.0) * parts.i("vert") * runL.i("lat"),
    precision: 1.05 * (wd?.precision ?? 1) * parts.i("precision"),
    weapons,
    bomb,
    killburst: parts.inc.get("killburst") ?? 0,
    flags: new Set([...parts.flags, ...(hullR ? [] : [])]),
    mainSlots,
    ordSlots,
    look: {
      hull: hd?.size ?? 1,
      wings: wd?.style ?? 1,
      engine: ed?.power ?? 1,
      hue: hull?.rarity === 3 ? 45 : HUES[hueSeed % HUES.length],
      mains: lo.main.slice(0, mainSlots).map((id) => (get(id) ? BASES[get(id)!.base].weapon! : null)),
      ords: lo.ord.slice(0, ordSlots).map((id) => (get(id) ? BASES[get(id)!.base].weapon! : null)),
    },
  };
}
