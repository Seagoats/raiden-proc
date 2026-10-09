/**
 * One sortie: a fixed-timestep simulation of the stage. Bullets and shots live
 * in struct-of-arrays pools; enemies are bucketed into a spatial hash for
 * shot collisions.
 */
import { hash, mulberry32, range, type Rng } from "../core/rng";
import { isHeld, pressed, touch } from "../core/input";
import { sfx } from "../core/audio";
import { W, H } from "../gfx/screen";
import { BULLET_R, BULLET_KINDS, buildPlayerShip, type BulletKind, type PlayerShipSprite, type Sprite } from "../gfx/sprites";
import { rollDrop, type Item, type Mod } from "./items";
import { computeBuild, type Build, type Loadout, type WeaponStats } from "./stats";
import type { EnemyDef } from "./enemies";
import { biomeOf, difficulty, type Difficulty, type Level } from "./campaign";

export const TICK = 60;

// ---------------------------------------------------------------- pools

export class Pool {
  n = 0;
  x: Float32Array; y: Float32Array; vx: Float32Array; vy: Float32Array;
  a: Float32Array; b: Float32Array; c: Float32Array;
  k: Uint8Array; life: Int32Array; tgt: Int32Array; last: Int32Array;
  constructor(public cap: number) {
    this.x = new Float32Array(cap); this.y = new Float32Array(cap); this.vx = new Float32Array(cap); this.vy = new Float32Array(cap);
    this.a = new Float32Array(cap); this.b = new Float32Array(cap); this.c = new Float32Array(cap);
    this.k = new Uint8Array(cap); this.life = new Int32Array(cap); this.tgt = new Int32Array(cap); this.last = new Int32Array(cap);
  }
  add(x: number, y: number, vx: number, vy: number, k: number): number {
    if (this.n >= this.cap) return -1;
    const i = this.n++;
    this.x[i] = x; this.y[i] = y; this.vx[i] = vx; this.vy[i] = vy; this.k[i] = k;
    this.a[i] = this.b[i] = this.c[i] = 0; this.life[i] = 0; this.tgt[i] = -1; this.last[i] = -1;
    return i;
  }
  /** Swap-remove. */
  kill(i: number) {
    const j = --this.n;
    if (i === j) return;
    this.x[i] = this.x[j]; this.y[i] = this.y[j]; this.vx[i] = this.vx[j]; this.vy[i] = this.vy[j];
    this.a[i] = this.a[j]; this.b[i] = this.b[j]; this.c[i] = this.c[j]; this.k[i] = this.k[j];
    this.life[i] = this.life[j]; this.tgt[i] = this.tgt[j]; this.last[i] = this.last[j];
  }
}

/** Player shot kinds. a = damage, b = pierce left, c = elite bonus. */
export const enum Shot { Vulcan, Laser, Dumbfire, Homing, Bomblet, Split, Burst }

// ---------------------------------------------------------------- entities

export interface Enemy {
  id: number;
  def: EnemyDef;
  x: number; y: number; vx: number; vy: number;
  hp: number; maxHp: number;
  hw: number; hh: number;
  t: number;
  sprite: Sprite;
  air: boolean;
  elite: boolean;
  affixes: string[];
  shield: number;
  flash: number;
  dead: boolean;
  /** Takes no damage (entering bosses, linked parts). */
  guard: number;
  /** Behaviour scratch space. */
  s: Record<string, any>;
  carry?: "P" | "B" | "D";
  parent?: Enemy;
  anchor?: BgObj;
  ox?: number; oy?: number;
  angle?: number;
}

export interface BgObj { img: CanvasImageSource & { width: number; height: number }; x: number; y: number; speed: number; layer: "sea" | "cloud"; alpha?: number; carrier?: boolean }

export type PickupKind = "P" | "B" | "D" | "medal" | "loot";
export interface Draft { label: string; mods: Mod[]; instant?: (w: World) => void }
export interface Pickup { kind: PickupKind; x: number; y: number; vx: number; vy: number; t: number; item?: Item; drafts?: Draft[]; dead?: boolean; big?: boolean }

export interface Fx {
  kind: "boom" | "spark" | "text" | "ring" | "flash" | "beam";
  x: number; y: number; vx: number; vy: number; t: number; life: number;
  s: number; color?: string; text?: string;
}

export interface Telegraph { x: number; y: number; t: number; dir: "top" | "left" | "right" | "bottom" }

// ---------------------------------------------------------------- the world

export interface WorldOpts { level: Level; tier: number; stash: Map<number, Item>; loadout: Loadout; seed: number }

export class World {
  rng: Rng;
  t = 0;
  tier: number;
  scrollSpeed = 0;
  scrolled = 0;
  phase: "launch" | "play" | "clear" | "dead" = "launch";
  phaseT = 0;
  build!: Build;
  stash: Map<number, Item>;
  loadout: Loadout;
  ship!: PlayerShipSprite;
  shipKey = "";

  // Player state.
  px = W / 2; py = H - 70;
  hp = 3; shields = 0; shieldT = 0; inv = 0; bombs = 0; p = 1; bank = 0;
  alive = true;
  runMods: Mod[] = [];
  cds: number[] = [];
  firing = false;
  focus = false;
  plasma: { x0: number; y0: number; x1: number; y1: number; tgt: Enemy | null; w: number }[] = [];
  bombT = 0;
  fieldT = 0;
  lift = 0;

  enemies: Enemy[] = [];
  shots = new Pool(4000);
  bullets = new Pool(3000);
  pickups: Pickup[] = [];
  fx: Fx[] = [];
  bg: BgObj[] = [];
  telegraphs: Telegraph[] = [];
  nextId = 1;
  shake = 0;

  score = 0;
  chain = 0;
  maxChain = 0;
  kills = 0;
  loot: Item[] = [];
  hits = 0;
  boss: Enemy | null = null;
  bossName = "";
  level: Level;
  diff: Difficulty;
  hpMul: number;
  density: number;
  bspeed: number;
  fireMul: number;
  speedMul: number;
  lootLeft: number;
  /** Depth scale for player-side numbers that should keep pace with enemies (split shots, bursts). */
  power: number;
  events: { t: number; fn: (w: World) => void }[] = [];
  pending: { at: number; fn: () => void }[] = [];
  scrollEvents: { at: number; fn: () => void }[] = [];
  scrollTarget = 0.4;
  bossWarning = 0;

  constructor(o: WorldOpts) {
    this.rng = mulberry32(o.seed);
    this.tier = o.tier;
    this.stash = o.stash;
    this.loadout = o.loadout;
    this.level = o.level;
    this.diff = difficulty(o.level, o.tier);
    this.hpMul = this.diff.hpMul;
    this.density = this.diff.density;
    this.bspeed = this.diff.bspeed;
    this.fireMul = this.diff.fireMul;
    this.speedMul = this.diff.speedMul;
    this.lootLeft = this.diff.lootBudget;
    this.power = this.diff.hpMul;
    this.rebuild();
    this.hp = this.build.hp;
    this.shields = this.build.shields;
    this.bombs = this.build.bomb?.stock ?? 0;
  }

  /** Recompute the build after gear or in-run changes; rebuild the sprite only when the look changes. */
  rebuild() {
    this.build = computeBuild(this.stash, this.loadout, { p: this.p, mods: this.runMods });
    const key = JSON.stringify(this.build.look);
    if (key !== this.shipKey) {
      this.ship = buildPlayerShip(this.build.look);
      this.shipKey = key;
    }
    while (this.cds.length < this.build.weapons.length) this.cds.push(0);
  }

  // ------------------------------------------------------------ spawning helpers

  spawn(def: EnemyDef, x: number, y: number, init: Partial<Enemy> = {}): Enemy {
    const sprite = def.sprite(this);
    const elite = !!def.elite;
    let hp = def.hp * this.hpMul;
    const e: Enemy = {
      id: this.nextId++, def, x, y, vx: 0, vy: 0, hp, maxHp: hp,
      hw: def.hw ?? sprite.w * 0.38, hh: def.hh ?? sprite.h * 0.38,
      t: 0, sprite, air: def.layer === "air", elite, affixes: [], shield: 0, flash: 0, dead: false, guard: 0, s: {},
      ...init,
    };
    // Hell tiers roll enemy affixes from the biome-twist pool.
    // Affixed enemies: taught in the sky fortress, everywhere in space and Hell.
    if (this.diff.affixChance > 0 && !def.boss && !def.noAffix && !init.parent) {
      const chance = this.diff.affixChance * (elite ? 1.5 : 1);
      const pool = ["armored", "revenge", "splitter", "relentless", "shielder"];
      for (let i = 0; i < this.diff.maxAffixes; i++) {
        if (this.rng() < chance) {
          const a = pool[Math.floor(this.rng() * pool.length)];
          if (!e.affixes.includes(a) && !(a === "relentless" && !e.air)) e.affixes.push(a);
        }
      }
      if (e.affixes.includes("armored")) e.hp = e.maxHp = e.maxHp * 4;
    }
    this.enemies.push(e);
    def.init?.(e, this);
    return e;
  }

  at(seconds: number, fn: (w: World) => void) {
    this.events.push({ t: Math.round(seconds * TICK), fn });
  }

  warn(x: number, y: number, dir: Telegraph["dir"]) {
    this.telegraphs.push({ x, y, t: 0, dir });
    sfx("cue");
  }

  // ------------------------------------------------------------ enemy fire

  fire(x: number, y: number, angle: number, speed: number, kind: BulletKind = "small", accel = 0) {
    const sp = speed * this.bspeed;
    const i = this.bullets.add(x, y, Math.cos(angle) * sp, Math.sin(angle) * sp, BULLET_KINDS.indexOf(kind));
    if (i >= 0) this.bullets.a[i] = accel;
  }
  aimAt(x: number, y: number) {
    return Math.atan2(this.py - y, this.px - x);
  }
  /** n bullets fanned over `spread` radians around an angle; n scales with tier density. */
  fan(x: number, y: number, angle: number, n: number, spread: number, speed: number, kind: BulletKind = "small", scale = true) {
    const count = scale ? Math.max(1, Math.round(n * this.density)) : n;
    const sp = scale ? spread * Math.min(1.6, this.density) : spread;
    for (let i = 0; i < count; i++) this.fire(x, y, count === 1 ? angle : angle - sp / 2 + (sp * i) / (count - 1), speed, kind);
  }
  ring(x: number, y: number, n: number, speed: number, offset = 0, kind: BulletKind = "small") {
    const count = Math.round(n * this.density);
    for (let i = 0; i < count; i++) this.fire(x, y, offset + (Math.PI * 2 * i) / count, speed, kind);
  }

  // ------------------------------------------------------------ update

  update() {
    this.t++;
    this.phaseT++;
    for (const ev of this.events) if (ev.t === this.t - (this.launchEnd ?? 1e9)) ev.fn(this);
    if (this.pending.length) {
      const due = this.pending.filter((p) => p.at <= this.t);
      this.pending = this.pending.filter((p) => p.at > this.t);
      due.forEach((p) => p.fn());
    }
    while (this.scrollEvents.length && this.scrolled >= this.scrollEvents[0].at) this.scrollEvents.shift()!.fn();
    if (this.bossWarning > 0) this.bossWarning--;
    this.scrolled += this.scrollSpeed;
    if (this.phase === "launch") this.updateLaunch();
    else if (this.alive) this.updatePlayer();
    else if (this.phase === "dead" && this.phaseT > 200) this.done = "failed";

    this.updateShots();
    this.updateEnemies();
    this.updateBullets();
    this.updatePickups();
    this.updateFx();
    for (const b of this.bg) b.y += this.scrollSpeed * b.speed;
    this.bg = this.bg.filter((b) => b.y < H + 20);
    for (const tg of this.telegraphs) tg.t++;
    this.telegraphs = this.telegraphs.filter((tg) => tg.t < 50);
    if (this.shake > 0) this.shake *= 0.88;
    if (this.phase === "clear" && this.phaseT > 300 && !this.done) {
      // Sweep up any loot still on screen.
      for (const p of this.pickups) if (p.kind === "loot") this.collect(p);
      this.done = "clear";
    }
  }

  launchEnd: number | null = null;
  done: "clear" | "failed" | null = null;
  retreated = false;

  updateLaunch() {
    const carrier = this.bg.find((b) => b.layer === "sea" && b.speed === 1 && (b as any).carrier);
    const t = this.phaseT;
    this.focus = false;
    if (t < 100) {
      // Unhurried: idle on the deck. Without a carrier (orbit) the ship waits below the screen.
      if (carrier) { this.px = carrier.x + carrier.img.width / 2; this.py = carrier.y + carrier.img.height * 0.8; }
      else { this.px = W / 2; this.py = H + 40; }
    } else {
      if (t === 100) sfx("launch");
      const k = Math.min(1, (t - 100) / 160);
      this.scrollSpeed = this.scrollTarget * k;
      this.lift = Math.min(1, (t - 100) / 120);
      const targetY = H - 80;
      this.py += (targetY - this.py) * 0.03 - (t < 160 ? 1.2 : 0);
      if (t > 260) {
        this.phase = "play";
        this.phaseT = 0;
        this.launchEnd = this.t;
      }
    }
  }

  updatePlayer() {
    const b = this.build;
    this.focus = isHeld("focus");
    let dx = (isHeld("right") ? 1 : 0) - (isHeld("left") ? 1 : 0);
    let dy = (isHeld("down") ? 1 : 0) - (isHeld("up") ? 1 : 0);
    if (dx && dy) { dx *= Math.SQRT1_2; dy *= Math.SQRT1_2; }
    const sx = this.focus ? b.precision : b.lat;
    const sy = this.focus ? b.precision : b.vert;
    this.px += dx * sx + touch.dx * 1.2;
    this.py += dy * sy + touch.dy * 1.2;
    this.px = Math.max(10, Math.min(W - 10, this.px));
    this.py = Math.max(24, Math.min(H - 20, this.py));
    const tb = dx !== 0 ? dx : Math.sign(touch.dx) * Math.min(1, Math.abs(touch.dx));
    this.bank += (tb - this.bank) * 0.2;

    if (this.inv > 0) this.inv--;
    if (this.shields < b.shields) {
      if (++this.shieldT >= b.recharge * TICK) { this.shields++; this.shieldT = 0; sfx("select"); this.text(this.px, this.py - 20, "SHIELD", "#7ff"); }
    } else this.shieldT = 0;

    this.firing = isHeld("fire") || touch.active;
    this.fireWeapons();
    if ((pressed("bomb") || touch.bomb) && this.bombs > 0 && this.bombT <= 0) this.useBomb();
    if (this.bombT > 0) this.updateBomb();
    if (this.fieldT > 0) {
      this.fieldT--;
      for (const e of this.enemies) if (Math.hypot(e.x - W / 2, e.y - H * 0.4) < 110) this.damage(e, (b.bomb?.damage ?? 200) * 0.012, 0);
    }
  }

  // ------------------------------------------------------------ player weapons

  mountPoints(w: WeaponStats) {
    const list = w.mount === "main" ? this.ship.mains : this.ship.ords;
    return list[w.slot] ?? list[0];
  }

  fireWeapons() {
    this.plasma = [];
    this.build.weapons.forEach((w, wi) => {
      const pts = this.mountPoints(w);
      const share = 1 / pts.length;
      if (w.type === "plasma") {
        if (this.firing) this.firePlasma(w, pts, share);
        return;
      }
      if (this.cds[wi] > 0) this.cds[wi]--;
      if (!this.firing || this.cds[wi] > 0) return;
      this.cds[wi] += TICK / w.rate;
      for (const pt of pts) {
        const x = this.px + pt.x, y = this.py + pt.y;
        const side = pt.x < -1 ? -1 : pt.x > 1 ? 1 : 0;
        if (w.type === "vulcan") {
          const n = w.amount;
          const spread = ((w.spread + 2.5 * Math.max(0, n - 3)) * Math.PI) / 180 * (this.focus ? 0.45 : 1);
          for (let k = 0; k < n; k++) {
            const a = -Math.PI / 2 + (n === 1 ? 0 : -spread / 2 + (spread * k) / (n - 1)) + side * 0.03;
            this.addShot(x, y, Math.cos(a) * w.speed, Math.sin(a) * w.speed, Shot.Vulcan, w.damage * share, w.pierce, w.elite);
          }
          sfx("shot");
        } else if (w.type === "laser") {
          const n = w.amount;
          for (let k = 0; k < n; k++) this.addShot(x + (k - (n - 1) / 2) * 5, y - 6, 0, -w.speed, Shot.Laser, w.damage * share, w.pierce, w.elite);
          sfx("laser");
        } else if (w.type === "dumbfire" || w.type === "homing") {
          const n = w.amount;
          for (let k = 0; k < n; k++) {
            const out = side === 0 ? (k % 2 ? 1 : -1) : side;
            const spreadK = Math.floor(k / (side === 0 ? 2 : 1));
            const kind = w.type === "dumbfire" ? Shot.Dumbfire : Shot.Homing;
            const i = this.addShot(x, y, out * (0.8 + spreadK * 0.5), 0.8 + spreadK * 0.2, kind, w.damage * share, w.pierce, w.elite);
            if (i >= 0) { this.shots.life[i] = -k * 3; this.shots.vx[i] *= w.type === "homing" ? 1.6 : 1; }
          }
          sfx("missile");
        }
      }
    });
  }

  addShot(x: number, y: number, vx: number, vy: number, k: Shot, dmg: number, pierce: number, elite: number, split = 0) {
    const i = this.shots.add(x, y, vx, vy, k);
    if (i >= 0) { this.shots.a[i] = dmg; this.shots.b[i] = pierce; this.shots.c[i] = elite + split * 1000; }
    return i;
  }

  firePlasma(w: WeaponStats, pts: { x: number; y: number }[], share: number) {
    const dps = (w.damage * w.rate) / TICK;
    const targets = this.enemies
      .filter((e) => !e.dead && e.guard <= 0 && e.y > -10 && e.y < H && e.hp > 0)
      .sort((a, b) => Math.hypot(a.x - this.px, (a.y - this.py) * 0.6) - Math.hypot(b.x - this.px, (b.y - this.py) * 0.6));
    for (const pt of pts) {
      const x0 = this.px + pt.x, y0 = this.py + pt.y;
      for (let k = 0; k < w.amount; k++) {
        const tgt = targets.length ? targets[k % targets.length] : null;
        const x1 = tgt ? tgt.x : x0 + (k - (w.amount - 1) / 2) * 14;
        const y1 = tgt ? tgt.y : -10;
        this.plasma.push({ x0, y0, x1, y1, tgt, w: Math.min(4, 1 + w.amount * 0.3) });
        if (tgt) this.damage(tgt, dps * share * (tgt.elite ? 1 + w.elite / 100 : 1), w.split);
      }
    }
    if (this.t % 6 === 0) sfx("hit");
  }

  // ------------------------------------------------------------ bombs

  useBomb() {
    const bomb = this.build.bomb!;
    this.bombs--;
    this.bombT = 1;
    this.inv = Math.max(this.inv, 150);
    sfx("bomb");
    if (bomb.flags.has("bshield") && this.shields < this.build.shields) this.shields++;
    if (bomb.type === "cluster") {
      for (let k = 0; k < 18; k++) {
        const a = -Math.PI / 2 + (k - 8.5) * 0.18;
        this.addShot(this.px, this.py, Math.cos(a) * 3, Math.sin(a) * 3, Shot.Bomblet, bomb.damage * 0.25, 0, 0);
      }
      this.clearBullets(this.px, this.py, 110, bomb.flags.has("bmedals"));
      this.bombT = 0;
    }
  }

  updateBomb() {
    const bomb = this.build.bomb!;
    this.bombT++;
    if (this.bombT === 40) {
      this.fx.push({ kind: "flash", x: 0, y: 0, vx: 0, vy: 0, t: 0, life: 40, s: 1 });
      this.fx.push({ kind: "ring", x: W / 2, y: H * 0.4, vx: 0, vy: 0, t: 0, life: 40, s: 300, color: "#fff" });
      this.clearBullets(W / 2, H / 2, 9999, bomb.flags.has("bmedals"));
      this.shake = 10;
      if (bomb.flags.has("bfield")) this.fieldT = 240;
    }
    if (this.bombT > 40 && this.bombT < 100) {
      for (const e of this.enemies) if (e.y > -20 && e.y < H + 10) this.damage(e, bomb.damage / 60, 0);
      if (this.bombT % 6 === 0) this.boom(range(this.rng, 20, W - 20), range(this.rng, 20, H * 0.7), 1);
      this.clearBullets(W / 2, H / 2, 9999, bomb.flags.has("bmedals"));
    }
    if (this.bombT >= 110) this.bombT = 0;
  }

  clearBullets(x: number, y: number, r: number, medals: boolean) {
    const B = this.bullets;
    for (let i = B.n - 1; i >= 0; i--) {
      if (Math.hypot(B.x[i] - x, B.y[i] - y) < r) {
        if (medals) { this.score += Math.round(10 * this.power); this.spark(B.x[i], B.y[i], "#ffd040", 1); }
        else this.spark(B.x[i], B.y[i], "#ff9ac8", 1);
        B.kill(i);
      }
    }
  }

  // ------------------------------------------------------------ shots

  grid = new Map<number, Enemy[]>();
  rebuildGrid() {
    this.grid.clear();
    for (const e of this.enemies) {
      if (e.dead) continue;
      const x0 = Math.floor((e.x - e.hw) / 32), x1 = Math.floor((e.x + e.hw) / 32);
      const y0 = Math.floor((e.y - e.hh) / 32), y1 = Math.floor((e.y + e.hh) / 32);
      for (let gy = y0; gy <= y1; gy++) for (let gx = x0; gx <= x1; gx++) {
        const k = gy * 64 + gx;
        let cell = this.grid.get(k);
        if (!cell) this.grid.set(k, (cell = []));
        cell.push(e);
      }
    }
  }

  updateShots() {
    this.rebuildGrid();
    const S = this.shots;
    for (let i = S.n - 1; i >= 0; i--) {
      const k = S.k[i] as Shot;
      S.life[i]++;
      if (k === Shot.Dumbfire) {
        if (S.life[i] > 0) { S.vy[i] = Math.max(S.vy[i] - 0.35, -9); S.vx[i] *= 0.9; }
        if (S.life[i] % 3 === 0) this.fx.push({ kind: "spark", x: S.x[i], y: S.y[i] + 4, vx: 0, vy: 1, t: 0, life: 10, s: 1, color: "#bbb" });
      } else if (k === Shot.Homing || k === Shot.Bomblet || k === Shot.Burst) {
        let tgt = S.tgt[i] >= 0 ? this.enemies.find((e) => e.id === S.tgt[i] && !e.dead) : undefined;
        if (!tgt && S.life[i] > 4) {
          tgt = this.nearestEnemy(S.x[i], S.y[i], S.last[i]);
          S.tgt[i] = tgt ? tgt.id : -1;
        }
        const sp = Math.hypot(S.vx[i], S.vy[i]);
        const want = Math.min(k === Shot.Bomblet ? 7 : 6.5, sp + 0.25);
        let ang = Math.atan2(S.vy[i], S.vx[i]);
        if (tgt && S.life[i] > 4) {
          const ta = Math.atan2(tgt.y - S.y[i], tgt.x - S.x[i]);
          let d = ta - ang;
          while (d > Math.PI) d -= Math.PI * 2;
          while (d < -Math.PI) d += Math.PI * 2;
          ang += Math.max(-0.16, Math.min(0.16, d));
        } else if (!tgt && S.life[i] > 4) ang += (-Math.PI / 2 - ang) * 0.08;
        S.vx[i] = Math.cos(ang) * want;
        S.vy[i] = Math.sin(ang) * want;
        if (S.life[i] % 3 === 0) this.fx.push({ kind: "spark", x: S.x[i], y: S.y[i], vx: 0, vy: 0.5, t: 0, life: 12, s: 1, color: k === Shot.Homing ? "#8fd" : "#fd8" });
      }
      S.x[i] += S.vx[i];
      S.y[i] += S.vy[i];
      if (S.y[i] < -20 || S.y[i] > H + 20 || S.x[i] < -20 || S.x[i] > W + 20 || S.life[i] > 400) { S.kill(i); continue; }
      // Collide.
      const cell = this.grid.get(Math.floor(S.y[i] / 32) * 64 + Math.floor(S.x[i] / 32));
      if (!cell) continue;
      // Parts (boss turrets) sit inside their parent's hitbox: they take the hit first.
      const reach = k === Shot.Laser ? 7 : 0;
      const overlaps = (e: Enemy) =>
        !e.dead && e.id !== S.last[i] && Math.abs(S.x[i] - e.x) <= e.hw + 1 && Math.abs(S.y[i] - e.y) <= e.hh + reach &&
        !(e.affixes.includes("reflector") && e.t % 120 < 40);
      const e = cell.find((c) => c.parent && overlaps(c)) ?? cell.find(overlaps);
      if (e) {
        const eliteBonus = e.elite ? 1 + (S.c[i] % 1000) / 100 : 1;
        const split = Math.floor(S.c[i] / 1000);
        this.damage(e, S.a[i] * eliteBonus, split);
        if (k === Shot.Dumbfire) {
          for (const o of this.enemies) if (o !== e && Math.hypot(o.x - S.x[i], o.y - S.y[i]) < 20) this.damage(o, S.a[i] * 0.5, 0);
          this.boom(S.x[i], S.y[i], 0.35);
          sfx("blast");
        } else this.spark(S.x[i], S.y[i] - 2, k === Shot.Laser ? "#9ef" : "#ffe", 2);
        if (S.b[i] >= 1) {
          S.b[i]--;
          S.last[i] = e.id;
          S.tgt[i] = -1;
        } else {
          S.kill(i);
        }
      }
    }
  }

  nearestEnemy(x: number, y: number, exclude = -1): Enemy | undefined {
    let best: Enemy | undefined, bd = 1e9;
    for (const e of this.enemies) {
      if (e.dead || e.id === exclude || e.y < -10 || e.y > H || e.guard > 0) continue;
      const d = Math.hypot(e.x - x, e.y - y);
      if (d < bd) { bd = d; best = e; }
    }
    return best;
  }

  // ------------------------------------------------------------ damage & death

  damage(e: Enemy, amount: number, split: number) {
    if (e.dead || e.guard > 0 || e.y < -e.hh) return;
    if (e.def.damageMul) amount *= e.def.damageMul(e, this);
    if (e.shield > 0) {
      const absorbed = Math.min(e.shield, amount);
      e.shield -= absorbed;
      amount -= absorbed;
    }
    e.hp -= amount;
    e.flash = 3;
    if (e.hp <= 0) this.kill(e, split);
  }

  kill(e: Enemy, split = 0) {
    if (e.dead) return;
    e.dead = true;
    this.kills++;
    const big = e.def.big || e.elite;
    this.score += Math.round(e.def.score * this.power);
    this.boom(e.x, e.y, big ? 1.4 : e.air ? 0.8 : 1);
    if (big) { this.shake = Math.max(this.shake, 5); sfx("boom"); for (let k = 0; k < 4; k++) this.boom(e.x + range(this.rng, -e.hw, e.hw), e.y + range(this.rng, -e.hh, e.hh), 0.7, k * 5); }
    else sfx("pop");
    e.def.onDeath?.(e, this);
    // Drops.
    if (e.carry) this.dropPickup(e.carry, e.x, e.y);
    if (e.def.medals) for (let k = 0; k < e.def.medals; k++) this.dropPickup("medal", e.x + (k - (e.def.medals - 1) / 2) * 10, e.y);
    // Loot is scarce: the level's guardian or boss always drops one item; elites have a small
    // chance at one more while the budget allows (keeping room for the boss drop).
    if (e.def.boss && this.lootLeft > 0) {
      this.lootLeft--;
      this.dropLoot(e.x, e.y, this.level.n === 3 ? 1 : 0.5);
      // Sometimes you get lucky: a second item.
      if (this.lootLeft > 0 && this.rng() < 0.25) { this.lootLeft--; this.dropLoot(e.x + 16, e.y, 0); }
    }
    else if (e.elite && !e.parent && this.lootLeft > 1 && this.rng() < this.diff.eliteLoot) { this.lootLeft--; this.dropLoot(e.x, e.y, 0.3); }
    // Split shots.
    if (split > 0) for (let k = 0; k < split; k++) {
      const a = (Math.PI * 2 * k) / split - Math.PI / 2;
      this.addShot(e.x, e.y, Math.cos(a) * 6, Math.sin(a) * 6, Shot.Split, 3 * this.power, 0, 0);
    }
    if (this.build.killburst > 0 && this.rng() * 100 < this.build.killburst) {
      for (let k = 0; k < 5; k++) {
        const a = -Math.PI / 2 + (k - 2) * 0.5;
        this.addShot(e.x, e.y, Math.cos(a) * 3, Math.sin(a) * 3, Shot.Burst, 6 * this.power, 0, 0);
      }
    }
    // Enemy affixes.
    if (e.affixes.includes("revenge")) this.ring(e.x, e.y, 10, 1.8, this.rng(), "orange");
    if (e.affixes.includes("splitter") && !e.parent) {
      for (const dx of [-10, 10]) {
        const c = this.spawn(e.def, e.x + dx, e.y, { parent: e, vx: dx * 0.12, vy: e.vy });
        c.hp = c.maxHp = e.maxHp * 0.3;
        c.affixes = [];
        c.s = { ...e.s };
      }
    }
    if (e.affixes.includes("shielder")) {
      for (const o of this.enemies) if (!o.dead && o !== e && Math.hypot(o.x - e.x, o.y - e.y) < 90) { o.shield += o.maxHp * 0.4; }
      this.fx.push({ kind: "ring", x: e.x, y: e.y, vx: 0, vy: 0, t: 0, life: 20, s: 90, color: "#6ff" });
    }
  }

  dropPickup(kind: PickupKind, x: number, y: number) {
    const p: Pickup = { kind, x, y, vx: kind === "medal" ? 0 : this.rng() < 0.5 ? -0.7 : 0.7, vy: kind === "medal" ? -1.5 : -1, t: 0 };
    if (kind === "D") p.drafts = this.rollDrafts();
    this.pickups.push(p);
  }

  dropLoot(x: number, y: number, bonus: number) {
    const ilvl = this.diff.rollIlvl(this.rng);
    const item = rollDrop(this.rng, { ilvl, tier: this.tier, depth: this.diff.D, bonusRarity: bonus });
    this.pickups.push({ kind: "loot", x, y, vx: range(this.rng, -0.8, 0.8), vy: -1.6, t: 0, item });
    sfx("drop");
  }

  rollDrafts(): Draft[] {
    // Early drafts are modest; they grow with depth so late-game runs feel louder.
    const D = this.diff.D;
    const amt = D < 4 ? 1 : D < 10 ? 2 : 3;
    const pct = (v: number) => Math.round(v * (D < 4 ? 0.6 : D < 10 ? 1 : 1.6));
    const pool: Draft[] = [
      { label: `AMOUNT +${amt}`, mods: [{ stat: "amount", kind: "flat", value: amt }] },
      { label: `+${pct(30)}% FIRE RATE`, mods: [{ stat: "rate", kind: "inc", value: pct(30) }] },
      { label: `+${pct(40)}% DAMAGE`, mods: [{ stat: "damage", kind: "inc", value: pct(40) }] },
      { label: "PIERCE +1", mods: [{ stat: "pierce", kind: "flat", value: 1 }] },
      { label: "+50% SPREAD", mods: [{ stat: "spread", kind: "inc", value: 50 }] },
      { label: "LASERS PIERCE +3", mods: [{ stat: "laser_pierce", kind: "flat", value: 3 }] },
      { label: `MISSILES +${amt}`, mods: [{ stat: "missile_amount", kind: "flat", value: amt }] },
      { label: "SHIELD +1", mods: [{ stat: "shields", kind: "flat", value: 1 }], instant: (w) => w.shields++ },
      { label: "+15% SPEED", mods: [{ stat: "lat", kind: "inc", value: 15 }] },
      { label: "BOMB +1", mods: [], instant: (w) => w.bombs++ },
      { label: "P +2", mods: [], instant: (w) => (w.p = Math.min(8, w.p + 2)) },
    ];
    const out: Draft[] = [];
    while (out.length < 3) {
      const d = pool[Math.floor(this.rng() * pool.length)];
      if (!out.includes(d)) out.push(d);
    }
    return out;
  }

  // ------------------------------------------------------------ enemies

  updateEnemies() {
    for (const e of this.enemies) {
      if (e.dead) continue;
      e.t++;
      if (e.flash > 0) e.flash--;
      if (e.guard > 0) e.guard--;
      if (e.anchor) { e.x = e.anchor.x + e.ox!; e.y = e.anchor.y + e.oy!; }
      e.def.update(e, this);
      if (e.affixes.includes("relentless") && e.t > 60) {
        const a = Math.atan2(this.py - e.y, this.px - e.x);
        e.vx += Math.cos(a) * 0.05; e.vy += Math.sin(a) * 0.05;
        const sp = Math.hypot(e.vx, e.vy);
        if (sp > 1.6) { e.vx *= 1.6 / sp; e.vy *= 1.6 / sp; }
        e.y = Math.min(e.y, H - 20);
      }
      // Air units get faster deeper into the campaign; sea and ground units stay locked to the scroll.
      const sp = e.air && !e.def.boss ? this.speedMul : 1;
      if (!e.anchor) { e.x += e.vx * sp; e.y += e.vy * sp; }
      // Body collision with the player (air units only).
      if (e.air && this.alive && this.phase === "play" && Math.abs(e.x - this.px) < e.hw * 0.7 && Math.abs(e.y - this.py) < e.hh * 0.7) {
        this.hurt();
        if (!e.def.boss) this.damage(e, 40 * this.power, 0);
      }
      const m = e.def.boss || e.affixes.includes("relentless") ? 400 : 60;
      if (e.y > H + m || e.y < -m * 3 || e.x < -m - 40 || e.x > W + m + 40) {
        e.dead = true;
        e.s.escaped = true;
      }
    }
    this.enemies = this.enemies.filter((e) => !e.dead);
  }

  // ------------------------------------------------------------ enemy bullets

  updateBullets() {
    const B = this.bullets;
    const hb = this.build.hitbox;
    for (let i = B.n - 1; i >= 0; i--) {
      if (B.a[i]) {
        const sp = Math.hypot(B.vx[i], B.vy[i]);
        const ns = Math.max(0.3, sp + B.a[i]);
        B.vx[i] *= ns / sp; B.vy[i] *= ns / sp;
      }
      B.x[i] += B.vx[i];
      B.y[i] += B.vy[i];
      B.life[i]++;
      if (B.x[i] < -12 || B.x[i] > W + 12 || B.y[i] < -12 || B.y[i] > H + 12) { B.kill(i); continue; }
      if (this.alive && this.phase === "play") {
        const r = BULLET_R[BULLET_KINDS[B.k[i]]];
        const dx = B.x[i] - this.px, dy = B.y[i] - this.py;
        if (dx * dx + dy * dy < (r + hb) * (r + hb)) {
          if (this.inv <= 0) { B.kill(i); this.hurt(); }
        }
      }
    }
  }

  hurt() {
    if (this.inv > 0 || !this.alive || this.phase !== "play") return;
    this.hits++;
    if (this.shields > 0) {
      this.shields--;
      this.inv = 100;
      sfx("shield");
      this.fx.push({ kind: "ring", x: this.px, y: this.py, vx: 0, vy: 0, t: 0, life: 18, s: 40, color: "#7ff" });
      if (this.build.flags.has("shockwave")) {
        this.clearBullets(this.px, this.py, 100, false);
        this.fx.push({ kind: "ring", x: this.px, y: this.py, vx: 0, vy: 0, t: 0, life: 24, s: 100, color: "#fff" });
      }
      if (this.build.flags.has("shieldburst")) for (let k = 0; k < 12; k++) {
        const a = (Math.PI * 2 * k) / 12;
        this.addShot(this.px, this.py, Math.cos(a) * 3, Math.sin(a) * 3, Shot.Burst, 10 * this.power, 0, 0);
      }
      return;
    }
    this.hp--;
    this.inv = 160;
    this.shake = 8;
    sfx("hurt");
    this.clearBullets(this.px, this.py, 50, false);
    // Lite Raiden death penalty: a hull hit costs one P level.
    if (this.p > 1) { this.p--; this.rebuild(); }
    if (this.hp <= 0) {
      this.alive = false;
      this.phase = "dead";
      this.phaseT = 0;
      for (let k = 0; k < 8; k++) this.boom(this.px + range(this.rng, -16, 16), this.py + range(this.rng, -16, 16), 1, k * 6);
      sfx("bigboom");
    }
  }

  // ------------------------------------------------------------ pickups

  updatePickups() {
    for (const p of this.pickups) {
      p.t++;
      const d = Math.hypot(p.x - this.px, p.y - this.py);
      if (p.kind === "medal") {
        p.vy = Math.min(p.vy + 0.05, 1.1);
      } else if (p.kind === "loot") {
        p.vy = Math.min(p.vy + 0.04, 0.35);
        p.vx *= 0.97;
      } else {
        // Raiden-style drifting power-ups bounce off the sides.
        p.vy = Math.min(p.vy + 0.03, 0.6);
        if (p.x < 10 || p.x > W - 10) p.vx = -p.vx;
      }
      const magnet = p.kind === "loot" ? 46 : p.kind === "medal" ? 34 : 0;
      if (this.alive && magnet && d < magnet) { p.vx += (this.px - p.x) * 0.04; p.vy += (this.py - p.y) * 0.04; }
      p.x += p.vx;
      p.y += p.vy;
      if (this.alive && this.phase !== "dead" && this.phase !== "launch" && d < 15) this.collect(p);
      if (p.y > H + 12) {
        p.dead = true;
        if (p.kind === "medal" && this.chain > 0) { this.text(W / 2, H - 40, "CHAIN LOST", "#f88"); this.chain = 0; }
      }
    }
    this.pickups = this.pickups.filter((p) => !p.dead);
  }

  collect(p: Pickup) {
    p.dead = true;
    switch (p.kind) {
      case "P":
        if (this.p < 8) { this.p++; this.rebuild(); this.text(p.x, p.y, this.p === 8 ? "MAX POWER" : `P${this.p}`, "#ff8"); }
        else { this.score += 5000; this.text(p.x, p.y, "5000", "#ff8"); }
        sfx("pickup");
        break;
      case "B":
        this.bombs++;
        this.text(p.x, p.y, "BOMB", "#8f8");
        sfx("bombup");
        break;
      case "D": {
        const d = p.drafts![Math.floor(p.t / 50) % 3];
        this.runMods.push(...d.mods);
        d.instant?.(this);
        this.rebuild();
        this.text(p.x, p.y - 8, d.label, "#f8f");
        sfx("draft");
        break;
      }
      case "medal": {
        const k = this.chain;
        const v = k < 10 ? (k + 1) * 100 : Math.min(10000, (k - 9) * 1000 + 1000);
        this.chain++;
        this.maxChain = Math.max(this.maxChain, this.chain);
        this.score += Math.round(v * this.power);
        this.text(p.x, p.y, `${v}`, "#ffd040");
        sfx("medal", k);
        break;
      }
      case "loot":
        this.loot.push(p.item!);
        this.text(p.x, p.y, "LOOT", ["#ddd", "#79f", "#fe5", "#f93"][p.item!.rarity]);
        sfx("loot", p.item!.rarity);
        break;
    }
  }

  // ------------------------------------------------------------ fx

  boom(x: number, y: number, s: number, delay = 0) {
    this.fx.push({ kind: "boom", x, y, vx: 0, vy: this.scrollSpeed * 0.5, t: -delay, life: 24, s });
    if (delay === 0) for (let k = 0; k < 4 + s * 6; k++) {
      const a = this.rng() * Math.PI * 2, sp = range(this.rng, 0.5, 2.5) * (0.6 + s * 0.4);
      this.fx.push({ kind: "spark", x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, t: 0, life: 14 + Math.floor(this.rng() * 14), s: 1, color: this.rng() < 0.5 ? "#ffd060" : "#ff7030" });
    }
  }
  spark(x: number, y: number, color: string, n: number) {
    for (let k = 0; k < n; k++) {
      const a = this.rng() * Math.PI * 2;
      this.fx.push({ kind: "spark", x, y, vx: Math.cos(a) * 1.2, vy: Math.sin(a) * 1.2 - 0.5, t: 0, life: 8, s: 1, color });
    }
  }
  text(x: number, y: number, text: string, color: string) {
    this.fx.push({ kind: "text", x, y, vx: 0, vy: -0.5, t: 0, life: 50, s: 1, text, color });
  }
  updateFx() {
    for (const f of this.fx) {
      f.t++;
      if (f.t > 0) { f.x += f.vx; f.y += f.vy; }
      if (f.kind === "spark") { f.vx *= 0.94; f.vy *= 0.94; }
    }
    this.fx = this.fx.filter((f) => f.t < f.life);
    if (this.fx.length > 900) this.fx.splice(0, this.fx.length - 900);
  }

  seed(n: number) {
    return hash(n, this.tier, this.level.index);
  }
}
