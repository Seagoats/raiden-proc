/**
 * Enemy types as data plus small behaviour functions. Fighters are Graftwing
 * ships tinted per biome; bosses are Codex sprites with turret rings. Fire
 * periods divide by the level's fireMul, so the same roster gets more
 * aggressive deeper into the campaign.
 */
import { hash } from "../core/rng";
import { sfx, playSong } from "../core/audio";
import { img } from "../gfx/assets";
import { buildEnemyShip, toSprite, type EnemyLookSpec, type Sprite } from "../gfx/sprites";
import { makeCanvas } from "../gfx/screen";
import { W, H } from "../gfx/screen";
import { BIOMES } from "./campaign";
import type { Enemy, World } from "./world";

export interface EnemyDef {
  name: string;
  layer: "air" | "sea" | "ground";
  hp: number;
  score: number;
  medals?: number;
  elite?: boolean;
  big?: boolean;
  boss?: boolean;
  noAffix?: boolean;
  /** Rotate the sprite to face its aim (turrets). */
  aims?: boolean;
  hw?: number;
  hh?: number;
  sprite(w: World): Sprite;
  init?(e: Enemy, w: World): void;
  update(e: Enemy, w: World): void;
  onDeath?(e: Enemy, w: World): void;
  damageMul?(e: Enemy, w: World): number;
}

// ---------------------------------------------------------------- sprites

/** Graftwing silhouettes per role; colour comes from the biome palette. */
const LOOKS: Record<string, Omit<EnemyLookSpec, "seed" | "hue">> = {
  zako: { size: 0, style: 0, power: 0, sat: 50, bright: 32, big: false },
  dart: { size: 0, style: 1, power: 1, sat: 45, bright: 34, big: false },
  swoop: { size: 1, style: 2, power: 0, sat: 40, bright: 30, big: false },
  weaver: { size: 1, style: 0, power: 1, sat: 40, bright: 32, big: false },
  courier: { size: 1, style: 1, power: 1, sat: 55, bright: 40, big: false },
  heavy: { size: 2, style: 2, power: 2, sat: 35, bright: 30, big: true },
  guardian: { size: 2, style: 0, power: 2, sat: 40, bright: 34, big: true },
};
export type ShipKind = keyof typeof LOOKS;
export const ENEMY_SHIP_KINDS = Object.keys(LOOKS) as ShipKind[];

const shipCache = new Map<string, Sprite>();
/** A biome's version of a role. Couriers stay green so item carriers always read. */
export function enemyShip(kind: ShipKind, biome: number, tier: number): Sprite {
  const key = `${kind}.${biome}.${tier}`;
  let s = shipCache.get(key);
  if (!s) {
    const hues = BIOMES[biome - 1].hues;
    const hue = kind === "courier" ? 135 : hues[kind.charCodeAt(0) % hues.length];
    s = buildEnemyShip({ ...LOOKS[kind], hue, seed: hash(tier, biome, kind.length * 7919, kind.charCodeAt(0)), huge: kind === "guardian" });
    shipCache.set(key, s);
  }
  return s;
}
const ship = (kind: ShipKind) => (w: World) => enemyShip(kind, w.level.biome, w.tier);

const assetCache = new Map<string, Sprite>();
export function assetSprite(name: string): Sprite {
  let s = assetCache.get(name);
  if (!s) {
    const im = img[name];
    const [c, x] = makeCanvas(im.width, im.height);
    x.drawImage(im, 0, 0);
    s = toSprite(c);
    assetCache.set(name, s);
  }
  return s;
}

// ---------------------------------------------------------------- helpers

/** True every `period` ticks (scaled by the level's aggression) after `offset`. */
function every(w: World, e: Enemy, period: number, offset = 0) {
  const p = Math.max(6, Math.round(period / w.fireMul));
  const o = Math.round(offset / w.fireMul);
  return e.t >= o && (e.t - o) % p === 0;
}
const onScreen = (e: Enemy) => e.y > 8 && e.y < H - 40 && e.x > 4 && e.x < W - 4;

// ---------------------------------------------------------------- roster

export const E: Record<string, EnemyDef> = {
  zako: {
    name: "Zako", layer: "air", hp: 3, score: 60,
    sprite: ship("zako"),
    init(e) { e.vx = (e.s.dir ?? 1) * 2.0; },
    update(e, w) {
      e.vy = Math.cos(e.t * 0.07) * 0.9;
      if (w.diff.D >= 3 && every(w, e, 90, 45) && onScreen(e)) w.fire(e.x, e.y + 6, w.aimAt(e.x, e.y), 2.2);
    },
  },
  dart: {
    name: "Dart", layer: "air", hp: 5, score: 100,
    sprite: ship("dart"),
    init(e) { e.vy = e.s.vy ?? 2.8; e.vx = e.s.vx ?? 0; },
    update(e, w) {
      // Flankers keep their sideways line; top entries slow to a cruise.
      if (!e.s.vx) e.vy = Math.max(1.1, e.vy - 0.06);
      if ((e.t === 40 || (w.diff.D >= 5 && e.t === 100)) && onScreen(e)) w.fan(e.x, e.y + 8, w.aimAt(e.x, e.y), 1, 0.3, 2.3);
    },
  },
  swoop: {
    name: "Swooper", layer: "air", hp: 4, score: 120,
    sprite: ship("swoop"),
    init(e) { e.s.a = e.s.up ? -Math.PI / 2 : Math.PI / 2; },
    update(e, w) {
      const side = e.s.side ?? 1;
      const base = e.s.up ? -Math.PI / 2 : Math.PI / 2;
      // Rear entries curve the other way so they arc up and over.
      const turn = e.s.up ? side * 0.028 : -side * 0.028;
      if (e.t > 24) e.s.a = Math.max(base - 1.35, Math.min(base + 1.35, e.s.a + turn));
      e.vx = Math.cos(e.s.a) * 2.6;
      e.vy = Math.sin(e.s.a) * 2.6;
      if (e.t === 34 && onScreen(e) && w.diff.D >= 1) w.fire(e.x, e.y + 6, w.aimAt(e.x, e.y), 2.4);
    },
  },
  weaver: {
    name: "Weaver", layer: "air", hp: 9, score: 150,
    sprite: ship("weaver"),
    init(e) { e.vy = 1.0; },
    update(e, w) {
      e.vx = Math.cos(e.t * 0.04 + (e.s.ph ?? 0)) * 1.8;
      if (every(w, e, 95, 40) && onScreen(e)) w.fan(e.x, e.y + 8, w.aimAt(e.x, e.y), 3, 0.5, 2.0);
    },
  },
  courier: {
    name: "Courier", layer: "air", hp: 10, score: 300, noAffix: true,
    sprite: ship("courier"),
    init(e) { e.vy = 0.9; },
    update(e) { e.vx = Math.sin(e.t * 0.03) * 0.6; },
  },
  heavy: {
    name: "Heavy", layer: "air", hp: 60, score: 1200, medals: 2, elite: true, big: true,
    sprite: ship("heavy"),
    init(e) { e.s.ty = e.s.ty ?? 90; },
    update(e, w) {
      if (e.t < 300) e.vy = (e.s.ty - e.y) * 0.035;
      else e.vy = Math.min(e.vy + 0.02, 1.4);
      if (e.t > 40 && e.t < 320 && onScreen(e)) {
        if (every(w, e, 55, 40)) w.fan(e.x, e.y + 14, w.aimAt(e.x, e.y), 5, 0.9, 2.1);
        if (w.diff.D >= 2 && every(w, e, 120, 80)) w.ring(e.x, e.y, 12, 1.5, e.t * 0.1, "big");
      }
    },
  },
  gunboat: {
    name: "Gunboat", layer: "sea", hp: 16, score: 250, medals: 1,
    hw: 9, hh: 22,
    sprite: () => assetSprite("gunboat"),
    update(e, w) {
      e.vy = w.scrollSpeed + 0.25;
      if (every(w, e, 100, 30 + (e.id % 4) * 13) && onScreen(e)) w.fan(e.x, e.y + 14, w.aimAt(e.x, e.y + 14), 3, 0.4, 1.8);
    },
  },
  destroyer: {
    name: "Destroyer", layer: "sea", hp: 180, score: 3000, medals: 4, elite: true, big: true,
    hw: 18, hh: 70,
    sprite: () => assetSprite("destroyer"),
    update(e, w) {
      e.vy = w.scrollSpeed + 0.12;
      if (!onScreen(e) && e.y < 0) return;
      for (const gy of [40, -10]) if (every(w, e, 105, 30 + (gy > 0 ? 0 : 50))) w.fan(e.x, e.y + gy, w.aimAt(e.x, e.y + gy), 5, 0.7, 1.9, "orange");
      if (every(w, e, 170, 90)) w.ring(e.x, e.y, 16, 1.4, e.t * 0.05);
    },
  },
  turret: {
    name: "Gun Emplacement", layer: "ground", hp: 20, score: 400, medals: 1, aims: true,
    hw: 9, hh: 10,
    sprite: (w) => assetSprite(`turrets_${w.nextId % 6}`),
    update(e, w) {
      e.vy = w.scrollSpeed;
      e.angle = w.aimAt(e.x, e.y);
      if (every(w, e, 105, 30 + (e.id % 5) * 11) && onScreen(e)) {
        const n = w.diff.D >= 4 ? 3 : 2;
        for (let k = 0; k < n; k++) w.fire(e.x + Math.cos(e.angle) * 10, e.y + Math.sin(e.angle) * 10, e.angle, 1.9 + k * 0.35, "needle");
      }
    },
  },
  /** Volcanic sea: surfaces after a bubbling telegraph, fires, then dives. */
  surfacer: {
    name: "Surfacer", layer: "sea", hp: 22, score: 350, medals: 1, aims: true,
    hw: 10, hh: 11,
    sprite: (w) => assetSprite(`turrets_${[1, 4, 3][w.nextId % 3]}`),
    init(e) { e.guard = 45; e.s.hidden = true; },
    update(e, w) {
      e.vy = w.scrollSpeed;
      if (e.t < 45) {
        if (e.t % 6 === 0) w.fx.push({ kind: "ring", x: e.x + (w.rng() - 0.5) * 12, y: e.y + (w.rng() - 0.5) * 12, vx: 0, vy: w.scrollSpeed, t: 0, life: 14, s: 8, color: "#bfe8ff" });
        return;
      }
      if (e.t === 45) { e.s.hidden = false; w.spark(e.x, e.y, "#cfefff", 10); }
      e.angle = w.aimAt(e.x, e.y);
      if (every(w, e, 70, 70) && onScreen(e)) w.fan(e.x, e.y, e.angle, 3, 0.45, 2.0, "orange");
      if (e.t > 330) { e.dead = true; e.s.escaped = true; w.spark(e.x, e.y, "#cfefff", 8); }
    },
  },
  /** End of x-1: a big Graftwing elite with an HP bar. */
  guardian: {
    name: "Guardian", layer: "air", hp: 700, score: 8000, medals: 4, elite: true, big: true, boss: true, noAffix: true,
    sprite: ship("guardian"),
    init(e, w) {
      e.guard = 120;
      w.boss = e;
      w.bossName = "GUARDIAN";
      playSong("boss");
    },
    update(e, w) {
      if (e.t < 120) { e.vy = (90 - e.y) * 0.03; return; }
      e.vy = (90 - e.y) * 0.05;
      e.vx = (W / 2 + Math.sin(e.t * 0.012) * 70 - e.x) * 0.04;
      const phase = Math.floor(e.t / 360) % 3;
      if (phase === 0 && every(w, e, 50)) w.fan(e.x, e.y + 20, w.aimAt(e.x, e.y), 5, 0.8, 2.0);
      if (phase === 1 && every(w, e, 70)) w.ring(e.x, e.y, 14, 1.4, e.t * 0.07, "big");
      if (phase === 2 && every(w, e, 8) && e.t % 120 < 60) w.fire(e.x, e.y + 20, w.aimAt(e.x, e.y) + Math.sin(e.t * 0.2) * 0.4, 2.6, "needle");
    },
    onDeath(e, w) { bossDeath(e, w, 10); },
  },
};

// ---------------------------------------------------------------- bosses

type At = (dx: number, dy: number) => [number, number];
interface BossSpec {
  name: string;
  sprite: string;
  hp: number;
  turrets: [number, number][];
  /** Where the core and the front (mouth/nose) are, relative to the sprite centre. */
  core: [number, number];
  nose: [number, number];
  ty: number;
  hw: number;
  hh: number;
  /** Phase 2 and 3 patterns. */
  p2: (e: Enemy, w: World, at: At) => void;
  p3: (e: Enemy, w: World, at: At) => void;
}

function bossDeath(e: Enemy, w: World, booms: number) {
  w.boss = null;
  w.clearBullets(W / 2, H / 2, 9999, false);
  for (let k = 0; k < booms; k++) w.boom(e.x + (w.rng() - 0.5) * e.hw * 3, e.y + (w.rng() - 0.5) * e.hh * 2, 1.2 + w.rng(), k * 7);
  w.fx.push({ kind: "flash", x: 0, y: 0, vx: 0, vy: 0, t: -booms * 7, life: 60, s: 1 });
  w.fx.push({ kind: "ring", x: e.x, y: e.y, vx: 0, vy: 0, t: -booms * 7, life: 50, s: 260, color: "#fff" });
  w.shake = 14;
  sfx("bigboom");
  for (let k = 0; k < 8; k++) w.dropPickup("medal", e.x + (k - 3.5) * 14, e.y + 20);
  w.phase = "clear";
  w.phaseT = 0;
  playSong(null);
}

function makeBoss(spec: BossSpec): EnemyDef {
  return {
    name: spec.name, layer: "air", hp: spec.hp, score: 50000, boss: true, big: true, noAffix: true,
    hw: spec.hw, hh: spec.hh,
    sprite: () => assetSprite(spec.sprite),
    init(e, w) {
      // x-2 previews the boss: two turrets, no final phase, less HP.
      const lite = w.level.n < 3;
      if (lite) e.hp = e.maxHp = e.maxHp * 0.3;
      e.guard = 240;
      e.s = { phase: 0, lite };
      const rings = lite ? spec.turrets.slice(0, 2) : spec.turrets;
      e.s.turrets = rings.map(([ox, oy], i) => w.spawn(E.bturret, e.x + ox, e.y + oy, { parent: e, ox, oy, s: { i } }));
      w.boss = e;
      w.bossName = spec.name;
      playSong("boss");
    },
    damageMul(e) { return e.s.phase <= 1 ? 0.12 : 1; },
    update(e, w) {
      const S = e.s;
      const at: At = (dx, dy) => [e.x + dx, e.y + dy];
      if (S.phase === 0) {
        e.vy = (spec.ty - e.y) * 0.018;
        if (e.t > 240) { S.phase = 1; e.vy = 0; }
        return;
      }
      e.vy = (spec.ty - e.y) * 0.05;
      const sway = S.phase === 3 ? 60 : 44;
      e.vx = (W / 2 + Math.sin(e.t * (S.phase === 3 ? 0.013 : 0.008)) * sway - e.x) * 0.05;
      const [nx, ny] = at(...spec.nose);
      if (S.phase === 1) {
        if (every(w, e, 170, 40)) w.ring(...at(...spec.core), 14, 1.4, e.t * 0.02, "big");
        if (every(w, e, 95, 20)) w.fan(nx, ny, w.aimAt(nx, ny), 3, 0.3, 2.5, "needle");
        if (S.turrets.every((t: Enemy) => t.dead)) {
          S.phase = 2;
          w.text(e.x, e.y + 20, "CORE EXPOSED", "#f66");
          sfx("warning");
        }
      } else if (S.phase === 2) {
        spec.p2(e, w, at);
        if (!S.lite && e.hp < e.maxHp * 0.4) { S.phase = 3; w.text(e.x, e.y + 20, "!!", "#f66"); }
      } else spec.p3(e, w, at);
    },
    onDeath(e, w) { bossDeath(e, w, 22); },
  };
}

export const BOSSES: Record<string, EnemyDef> = {
  leviathan: makeBoss({
    name: "LEVIATHAN GUNSHIP", sprite: "boss_gunship", hp: 1800,
    turrets: [[-32, -40], [31, -40], [-32, -11], [31, -11]], core: [0, -3], nose: [0, 88], ty: 100, hw: 36, hh: 62,
    p2(e, w, at) {
      if (e.t % 5 === 0) { e.s.a = (e.s.a ?? 0) + 0.21; const [x, y] = at(0, -3); w.fire(x, y, e.s.a, 1.6); w.fire(x, y, e.s.a + Math.PI, 1.6); }
      if (every(w, e, 75)) { const [x, y] = at(0, 88); w.fan(x, y, w.aimAt(x, y), 5, 0.6, 2.2, "big"); }
    },
    p3(e, w, at) {
      if (every(w, e, 28)) { e.s.flip = !e.s.flip; w.ring(...at(0, -3), 18, 1.7, e.s.flip ? 0.17 : 0); }
      if (every(w, e, 52, 10)) { const [x, y] = at(0, 88); w.fan(x, y, w.aimAt(x, y), 7, 0.9, 2.6, "needle"); }
    },
  }),
  serpent: makeBoss({
    name: "MAGMA SERPENT", sprite: "boss_serpent", hp: 2200,
    turrets: [[-48, -91], [48, -91], [-52, -12], [52, -12]], core: [0, 41], nose: [0, 118], ty: 112, hw: 40, hh: 100,
    p2(e, w, at) {
      // Fire breath: a sweeping stream from the jaws.
      const [x, y] = at(0, 118);
      if (e.t % 4 === 0 && e.t % 150 < 90) w.fire(x, y, Math.PI / 2 + Math.sin(e.t * 0.04) * 0.9, 2.4, "orange");
      if (every(w, e, 90)) w.ring(...at(0, 41), 12, 1.3, e.t * 0.03, "big");
    },
    p3(e, w, at) {
      const [x, y] = at(0, 118);
      if (e.t % 3 === 0) w.fire(x, y, Math.PI / 2 + Math.sin(e.t * 0.06) * 1.1, 2.6, "orange");
      if (every(w, e, 45)) w.ring(...at(0, 41), 16, 1.5, e.t * 0.05);
    },
  }),
  fortress: makeBoss({
    name: "FORTRESS CORE", sprite: "boss_fortress", hp: 2600,
    turrets: [[-37, -34], [35, -34], [-37, 2], [35, 2]], core: [0, -18], nose: [0, 95], ty: 100, hw: 38, hh: 60,
    p2(e, w, at) {
      // Rotating four-way needle streams.
      if (e.t % 6 === 0) { e.s.a = (e.s.a ?? 0) + 0.09; for (let k = 0; k < 4; k++) w.fire(...at(0, -18), e.s.a + (k * Math.PI) / 2, 2.0, "needle"); }
      if (every(w, e, 80)) { const [x, y] = at(0, 95); w.fan(x, y, w.aimAt(x, y), 3, 0.3, 2.8, "big"); }
    },
    p3(e, w, at) {
      if (e.t % 5 === 0) { e.s.a = (e.s.a ?? 0) + 0.13; for (let k = 0; k < 6; k++) w.fire(...at(0, -18), e.s.a + (k * Math.PI) / 3, 2.1, "needle"); }
      if (every(w, e, 40)) w.ring(...at(0, -18), 20, 1.4, e.t * 0.1);
    },
  }),
  core: makeBoss({
    name: "THE CORE", sprite: "boss_core", hp: 3200,
    turrets: [[-52, -48], [52, -48], [-52, 32], [52, 32]], core: [0, -8], nose: [0, 90], ty: 105, hw: 42, hh: 50,
    p2(e, w, at) {
      // Counter-rotating double spiral.
      if (e.t % 4 === 0) {
        e.s.a = (e.s.a ?? 0) + 0.17;
        const [x, y] = at(0, -8);
        w.fire(x, y, e.s.a, 1.7);
        w.fire(x, y, -e.s.a * 1.3, 1.5, "big");
      }
      if (every(w, e, 70)) { const [x, y] = at(0, 90); w.fan(x, y, w.aimAt(x, y), 7, 1.0, 2.4, "needle"); }
    },
    p3(e, w, at) {
      if (every(w, e, 22)) { e.s.flip = !e.s.flip; w.ring(...at(0, -8), 24, 1.6, e.s.flip ? 0.13 : 0); }
      if (e.t % 3 === 0) { e.s.a = (e.s.a ?? 0) + 0.23; w.fire(...at(0, -8), e.s.a, 2.2, "orange"); }
      if (every(w, e, 60, 20)) { const [x, y] = at(0, 90); w.fan(x, y, w.aimAt(x, y), 5, 0.5, 3.0, "big"); }
    },
  }),
};

E.bturret = {
  name: "Boss Turret", layer: "air", hp: 170, score: 5000, medals: 2, aims: true, noAffix: true,
  hw: 11, hh: 13,
  sprite: (w) => assetSprite(`turrets_${[0, 1, 3, 2][w.nextId % 4]}`),
  update(e, w) {
    const p = e.parent!;
    if (p.dead) { w.kill(e); return; }
    e.x = p.x + e.ox!;
    e.y = p.y + e.oy!;
    e.vx = e.vy = 0;
    e.guard = p.s.phase === 0 ? 2 : 0;
    e.angle = w.aimAt(e.x, e.y);
    if (p.s.phase === 1 && every(w, e, 80, 20 + e.s.i * 19)) w.fan(e.x, e.y, e.angle, 3, 0.35, 2.1);
    if (p.s.phase === 1 && w.diff.D >= 6 && every(w, e, 150, 60 + e.s.i * 23)) w.ring(e.x, e.y, 8, 1.3, e.t * 0.1);
  },
};
