/** Enemy types as data plus small behaviour functions. Fighters are Graftwing ships. */
import { hash } from "../core/rng";
import { sfx, playSong } from "../core/audio";
import { img } from "../gfx/assets";
import { buildEnemyShip, toSprite, type EnemyLookSpec, type Sprite } from "../gfx/sprites";
import { makeCanvas } from "../gfx/screen";
import { W, H } from "../gfx/screen";
import type { Enemy, World } from "./world";

export interface EnemyDef {
  name: string;
  layer: "air" | "sea" | "ground";
  hp: number;
  score: number;
  loot?: number;
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

/** Graftwing designs per tier: each Hell tier remixes the squadron's look. */
const LOOKS: Record<string, Omit<EnemyLookSpec, "seed">> = {
  zako: { size: 0, style: 0, power: 0, hue: 0, sat: 50, bright: 32, big: false },
  dart: { size: 0, style: 1, power: 1, hue: 18, sat: 45, bright: 34, big: false },
  swoop: { size: 1, style: 2, power: 0, hue: 345, sat: 40, bright: 30, big: false },
  weaver: { size: 1, style: 0, power: 1, hue: 285, sat: 40, bright: 32, big: false },
  courier: { size: 1, style: 1, power: 1, hue: 135, sat: 55, bright: 40, big: false },
  heavy: { size: 2, style: 2, power: 2, hue: 75, sat: 35, bright: 30, big: true },
  heavy2: { size: 2, style: 0, power: 2, hue: 205, sat: 30, bright: 32, big: true },
};

const shipCache = new Map<string, Sprite>();
export function enemyShip(kind: keyof typeof LOOKS, tier: number): Sprite {
  const key = `${kind}.${tier}`;
  let s = shipCache.get(key);
  if (!s) {
    s = buildEnemyShip({ ...LOOKS[kind], seed: hash(tier, kind.length * 7919, kind.charCodeAt(0)) });
    shipCache.set(key, s);
  }
  return s;
}
export const ENEMY_SHIP_KINDS = Object.keys(LOOKS) as (keyof typeof LOOKS)[];

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

const every = (e: Enemy, period: number, offset = 0) => e.t >= offset && (e.t - offset) % period === 0;
const onScreen = (e: Enemy) => e.y > 8 && e.y < H - 40 && e.x > 4 && e.x < W - 4;

// ---------------------------------------------------------------- roster

export const E: Record<string, EnemyDef> = {
  zako: {
    name: "Zako", layer: "air", hp: 3, score: 60, loot: 0.012,
    sprite: (w) => enemyShip("zako", w.tier),
    init(e) { e.vx = (e.s.dir ?? 1) * 2.1; e.s.y0 = e.y; },
    update(e, w) {
      e.vy = Math.cos(e.t * 0.07) * 0.9;
      if (w.tier > 0 && every(e, 80, 40) && onScreen(e)) w.fire(e.x, e.y + 6, w.aimAt(e.x, e.y), 2.2);
    },
  },
  dart: {
    name: "Dart", layer: "air", hp: 5, score: 100, loot: 0.02,
    sprite: (w) => enemyShip("dart", w.tier),
    init(e) { e.vy = 3; },
    update(e, w) {
      e.vy = Math.max(1.1, e.vy - 0.06);
      if ((e.t === 36 || e.t === 96) && onScreen(e)) w.fan(e.x, e.y + 8, w.aimAt(e.x, e.y), 1, 0.3, 2.3);
    },
  },
  swoop: {
    name: "Swooper", layer: "air", hp: 4, score: 120, loot: 0.02,
    sprite: (w) => enemyShip("swoop", w.tier),
    init(e) { e.s.a = Math.PI / 2; },
    update(e, w) {
      const side = e.s.side ?? 1;
      if (e.t > 24) e.s.a = Math.max(Math.PI / 2 - 1.35, Math.min(Math.PI / 2 + 1.35, e.s.a - side * 0.028));
      e.vx = Math.cos(e.s.a) * 2.7;
      e.vy = Math.sin(e.s.a) * 2.7;
      if (e.t === 30 && onScreen(e)) w.fire(e.x, e.y + 6, w.aimAt(e.x, e.y), 2.4);
    },
  },
  weaver: {
    name: "Weaver", layer: "air", hp: 9, score: 150, loot: 0.03,
    sprite: (w) => enemyShip("weaver", w.tier),
    init(e) { e.s.x0 = e.x; e.vy = 1.0; },
    update(e, w) {
      e.vx = Math.cos(e.t * 0.04 + (e.s.ph ?? 0)) * 1.8;
      if (every(e, 85, 40) && onScreen(e)) w.fan(e.x, e.y + 8, w.aimAt(e.x, e.y), 3, 0.5, 2.0);
    },
  },
  courier: {
    name: "Courier", layer: "air", hp: 14, score: 300, loot: 0.15,
    sprite: (w) => enemyShip("courier", w.tier),
    init(e) { e.vy = 0.9; },
    update(e) { e.vx = Math.sin(e.t * 0.03) * 0.6; },
  },
  heavy: {
    name: "Heavy", layer: "air", hp: 80, score: 1200, loot: 0.4, medals: 2, elite: true, big: true,
    sprite: (w) => enemyShip(Math.floor(w.t / 600) % 2 ? "heavy2" : "heavy", w.tier),
    init(e) { e.s.ty = e.s.ty ?? 90; },
    update(e, w) {
      if (e.t < 300) e.vy = (e.s.ty - e.y) * 0.035;
      else e.vy = Math.min(e.vy + 0.02, 1.4);
      if (e.t > 40 && e.t < 320 && onScreen(e)) {
        if (every(e, 46, 40)) w.fan(e.x, e.y + 14, w.aimAt(e.x, e.y), 5, 0.9, 2.1);
        if (every(e, 110, 80)) w.ring(e.x, e.y, 12, 1.5, e.t * 0.1, "big");
      }
    },
  },
  gunboat: {
    name: "Gunboat", layer: "sea", hp: 20, score: 250, loot: 0.05, medals: 1, aims: false,
    hw: 9, hh: 22,
    sprite: () => assetSprite("gunboat"),
    update(e, w) {
      e.vy = w.scrollSpeed + 0.25;
      if (every(e, 95, 30 + (e.id % 4) * 13) && onScreen(e)) w.fan(e.x, e.y + 14, w.aimAt(e.x, e.y + 14), 3, 0.4, 1.8);
    },
  },
  destroyer: {
    name: "Destroyer", layer: "sea", hp: 260, score: 3000, loot: 0.9, medals: 4, elite: true, big: true,
    hw: 18, hh: 70,
    sprite: () => assetSprite("destroyer"),
    update(e, w) {
      e.vy = w.scrollSpeed + 0.12;
      if (!onScreen(e) && e.y < 0) return;
      for (const gy of [40, -10]) if (every(e, 100, 30 + (gy > 0 ? 0 : 50))) w.fan(e.x, e.y + gy, w.aimAt(e.x, e.y + gy), 5, 0.7, 1.9, "orange");
      if (every(e, 170, 90)) w.ring(e.x, e.y, 16, 1.4, e.t * 0.05);
    },
  },
  turret: {
    name: "Gun Emplacement", layer: "ground", hp: 26, score: 400, loot: 0.06, medals: 1, aims: true,
    hw: 9, hh: 10,
    sprite: (w) => assetSprite(`turrets_${(w.nextId % 6)}`),
    update(e, w) {
      e.vy = w.scrollSpeed;
      e.angle = w.aimAt(e.x, e.y);
      if (every(e, 100, 30 + (e.id % 5) * 11) && onScreen(e)) {
        for (let k = 0; k < 3; k++) w.fire(e.x + Math.cos(e.angle) * 10, e.y + Math.sin(e.angle) * 10, e.angle, 1.9 + k * 0.35, "needle");
      }
    },
  },

  // ------------------------------------------------------------ mini-boss
  boss: {
    name: "Leviathan Gunship", layer: "air", hp: 2600, score: 50000, loot: 0, boss: true, big: true, noAffix: true,
    hw: 36, hh: 62,
    sprite: () => assetSprite("boss_gunship"),
    init(e, w) {
      e.guard = 240;
      e.s.phase = 0;
      e.s.turrets = [[-32, -40], [31, -40], [-32, -11], [31, -11]].map(([ox, oy], i) =>
        w.spawn(E.bturret, e.x + ox, e.y + oy, { parent: e, ox, oy, s: { i } }));
      w.boss = e;
      w.bossName = "LEVIATHAN GUNSHIP";
      playSong("boss");
    },
    damageMul(e) {
      return e.s.phase === 1 ? 0.12 : 1;
    },
    update(e, w) {
      const S = e.s;
      if (S.phase === 0) {
        e.vy = (100 - e.y) * 0.018;
        if (e.t > 240) { S.phase = 1; e.vy = 0; }
        return;
      }
      e.vy = (100 - e.y) * 0.05;
      const sway = S.phase === 3 ? 70 : 50;
      e.vx = (W / 2 + Math.sin(e.t * (S.phase === 3 ? 0.013 : 0.008)) * sway - e.x) * 0.05;
      const nose = e.y + 88;
      if (S.phase === 1) {
        if (every(e, 160, 40)) w.ring(e.x, e.y, 14, 1.4, e.t * 0.02, "big");
        if (every(e, 90, 20)) w.fan(e.x, nose, w.aimAt(e.x, nose), 3, 0.3, 2.6, "needle");
        if (S.turrets.every((t: Enemy) => t.dead)) {
          S.phase = 2;
          w.text(e.x, e.y + 20, "CORE EXPOSED", "#f66");
          sfx("warning");
        }
      } else if (S.phase === 2) {
        if (e.t % 5 === 0) {
          S.a = (S.a ?? 0) + 0.21;
          w.fire(e.x, e.y, S.a, 1.6);
          w.fire(e.x, e.y, S.a + Math.PI, 1.6);
          if (w.tier > 0) w.fire(e.x, e.y, S.a + Math.PI / 2, 1.6);
        }
        if (every(e, 70)) w.fan(e.x, nose, w.aimAt(e.x, nose), 5, 0.6, 2.2, "big");
        if (e.hp < e.maxHp * 0.4) { S.phase = 3; w.text(e.x, e.y + 20, "!!", "#f66"); }
      } else {
        if (every(e, 26)) { S.flip = !S.flip; w.ring(e.x, e.y, 18, 1.7, S.flip ? 0.17 : 0); }
        if (every(e, 50, 10)) w.fan(e.x, nose, w.aimAt(e.x, nose), 7, 0.9, 2.6, "needle");
      }
    },
    onDeath(e, w) {
      w.boss = null;
      w.clearBullets(W / 2, H / 2, 9999, false);
      for (let k = 0; k < 22; k++) w.boom(e.x + (w.rng() - 0.5) * 160, e.y + (w.rng() - 0.5) * 170, 1.2 + w.rng(), k * 7);
      w.fx.push({ kind: "flash", x: 0, y: 0, vx: 0, vy: 0, t: -150, life: 60, s: 1 });
      w.fx.push({ kind: "ring", x: e.x, y: e.y, vx: 0, vy: 0, t: -150, life: 50, s: 260, color: "#fff" });
      w.shake = 14;
      sfx("bigboom");
      setTimeout(() => sfx("bigboom"), 2500);
      for (let k = 0; k < 3 + w.tier; k++) w.dropLoot(e.x + (k - 1) * 20, e.y, 1);
      for (let k = 0; k < 8; k++) w.dropPickup("medal", e.x + (k - 3.5) * 14, e.y + 20);
      w.phase = "clear";
      w.phaseT = 0;
      playSong(null);
    },
  },
  bturret: {
    name: "Gunship Turret", layer: "air", hp: 300, score: 5000, loot: 0.3, medals: 2, aims: true, noAffix: true,
    hw: 11, hh: 13,
    sprite: (w) => assetSprite(`turrets_${[0, 1, 3, 2][(w.nextId) % 4]}`),
    update(e, w) {
      const p = e.parent!;
      if (p.dead) { w.kill(e); return; }
      e.x = p.x + e.ox!;
      e.y = p.y + e.oy!;
      e.vx = e.vy = 0;
      e.guard = p.s.phase === 0 ? 2 : 0;
      e.angle = w.aimAt(e.x, e.y);
      if (p.s.phase === 1 && every(e, 75, 20 + e.s.i * 19)) w.fan(e.x, e.y, e.angle, 3, 0.35, 2.1);
      if (p.s.phase === 1 && w.tier > 0 && every(e, 140, 60 + e.s.i * 23)) w.ring(e.x, e.y, 8, 1.3, e.t * 0.1);
    },
  },
};
