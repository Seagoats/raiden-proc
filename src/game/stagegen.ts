/**
 * Builds a level: stacks its Codex strips into a scrolling background (the
 * last strip loops for the boss) and directs waves from a seeded template
 * pool gated by depth and the level's twist. x-1 ends with a Graftwing
 * guardian, x-2 previews the biome boss, x-3 is the full boss.
 */
import { img } from "../gfx/assets";
import { makeCanvas, W, H } from "../gfx/screen";
import { sfx, playSong } from "../core/audio";
import { mulberry32, type Rng } from "../core/rng";
import { BOSSES, E } from "./enemies";
import { biomeOf, levelSeed, type Level } from "./campaign";
import type { World } from "./world";

export const STRIP_H = 432;
export const OVERLAP = 64;
export const PERIOD = STRIP_H - OVERLAP;
export const SCROLL = 0.33;

interface Strip { faded: HTMLCanvasElement; plain: HTMLCanvasElement; shimmer: HTMLCanvasElement[] }
const stripCache = new Map<string, Strip>();
let segments: string[] = [];
let loopName = "";

/** Faded-bottom copy and water/star shimmer frames for one strip (cached). */
function prepareStrip(name: string, shimmerKind: "water" | "stars" | "none"): Strip {
  const hit = stripCache.get(name);
  if (hit) return hit;
  const src = img[name];
  const [plain, px] = makeCanvas(W, STRIP_H);
  if (src) px.drawImage(src, 0, 0, W, STRIP_H);
  else { px.fillStyle = "#14408a"; px.fillRect(0, 0, W, STRIP_H); }
  const [faded, fx] = makeCanvas(W, STRIP_H);
  fx.drawImage(plain, 0, 0);
  // One full-height mask: destination-in clears everything outside the filled shape.
  const g = fx.createLinearGradient(0, 0, 0, STRIP_H);
  g.addColorStop(0, "rgba(0,0,0,1)");
  g.addColorStop((STRIP_H - OVERLAP) / STRIP_H, "rgba(0,0,0,1)");
  g.addColorStop(1, "rgba(0,0,0,0)");
  fx.globalCompositeOperation = "destination-in";
  fx.fillStyle = g;
  fx.fillRect(0, 0, W, STRIP_H);
  const d = px.getImageData(0, 0, W, STRIP_H).data;
  const shimmer = [0, 1, 2, 3].map((k) => {
    const [c, x] = makeCanvas(W, STRIP_H);
    if (shimmerKind === "none") return c;
    const out = x.createImageData(W, STRIP_H);
    const o = out.data;
    const ph = (k * Math.PI) / 2;
    for (let y = 0; y < STRIP_H; y++) for (let xx = 0; xx < W; xx++) {
      const i = (y * W + xx) * 4;
      const [r, gg, b] = [d[i], d[i + 1], d[i + 2]];
      const fade = y > STRIP_H - OVERLAP ? 1 - (y - (STRIP_H - OVERLAP)) / OVERLAP : 1;
      if (shimmerKind === "water") {
        if (!(b > 60 && b > r * 1.4 && b > gg * 1.0)) continue;
        const f = Math.sin(xx * 0.55 + y * 0.2 + ph) + Math.sin(xx * 0.23 - y * 0.41 + ph * 1.5) + Math.sin(y * 0.9 - ph);
        if (f < 2.1) continue;
        o[i] = Math.min(255, r + 70); o[i + 1] = Math.min(255, gg + 80); o[i + 2] = Math.min(255, b + 60); o[i + 3] = 200 * fade;
      } else {
        // Twinkle the brightest stars.
        if (r + gg + b < 520) continue;
        if (((xx * 7 + y * 13 + k * 5) % 4) !== 0) continue;
        o[i] = o[i + 1] = o[i + 2] = 255; o[i + 3] = 220 * fade;
      }
    }
    x.putImageData(out, 0, 0);
    return c;
  });
  const s = { faded, plain, shimmer };
  stripCache.set(name, s);
  return s;
}

const shimmerFor = (name: string): "water" | "stars" | "none" => (name.startsWith("b4") ? "stars" : name.startsWith("b3") ? "none" : "water");

export function prepareBackground(level: Level) {
  segments = level.strips;
  loopName = level.loop;
  for (const n of [...segments, loopName]) prepareStrip(n, shimmerFor(n));
}

const segTop = (k: number, scrolled: number) => H - STRIP_H - k * PERIOD + scrolled;

export function drawBackground(g: CanvasRenderingContext2D, scrolled: number, t: number) {
  if (!segments.length) { g.fillStyle = "#14408a"; g.fillRect(0, 0, W, H); return; }
  const first = Math.max(0, Math.floor((scrolled - STRIP_H) / PERIOD));
  const frame = Math.floor(t / 10) % 4;
  for (let k = first; k < first + 3; k++) {
    const y = Math.round(segTop(k, scrolled));
    if (y > H || y + STRIP_H < 0) continue;
    const s = stripCache.get(k < segments.length ? segments[k] : loopName)!;
    g.drawImage(k === 0 ? s.plain : s.faded, 0, y);
    g.drawImage(s.shimmer[frame], 0, y);
  }
}

/** Scroll value at which a point in segment k (at strip-local y) reaches the top of the screen. */
const scrollFor = (k: number, sy: number) => STRIP_H + k * PERIOD - H - sy - 16;

/** Gun emplacements painted on strips: strip name -> [x, y] in strip coordinates. */
export const GROUND: Record<string, [number, number][]> = {
  bg_05: [[175, 95], [255, 140], [205, 230], [250, 300], [160, 300]],
  bg_06: [[75, 85], [225, 145], [140, 190], [55, 250], [250, 270], [150, 330]],
  b2_03: [[70, 200], [220, 190], [110, 300], [200, 320]],
  b2_04: [[60, 130], [150, 110], [225, 200], [110, 250], [190, 300]],
  b3_02: [[70, 140], [200, 120], [145, 250], [90, 300], [230, 300]],
  b3_03: [[60, 110], [225, 110], [150, 200], [70, 300], [220, 320]],
  b3_04: [[60, 150], [230, 150], [150, 230], [80, 320], [220, 320]],
  b3_05: [[90, 140], [200, 140], [60, 230], [230, 230], [145, 330]],
};

// ---------------------------------------------------------------- wave templates

type Spawn = (w: World) => void;
interface Template { id: string; weight: number; minD?: number; spawn: (w: World, r: Rng) => void; cooldown?: number }

function later(w: World, ticks: number, fn: () => void) {
  if (ticks <= 0) return fn();
  w.pending.push({ at: w.t + ticks, fn });
}
const count = (w: World, base: number) => Math.max(1, Math.round(base * (0.85 + 0.45 * Math.min(w.diff.D / 11, 1.5))));

const T = {
  zako: (w: World, r: Rng) => {
    const dir = r() < 0.5 ? 1 : -1;
    const y = 40 + r() * 80;
    const n = count(w, 5);
    for (let i = 0; i < n; i++) w.spawn(E.zako, dir > 0 ? -20 - i * 22 : W + 20 + i * 22, y, { s: { dir } });
  },
  darts: (w: World, r: Rng) => {
    const n = count(w, 3);
    const x0 = 30 + r() * (W - 60 - (n - 1) * 34);
    for (let i = 0; i < n; i++) later(w, i * 10, () => w.spawn(E.dart, x0 + i * 34, -20));
  },
  swoops: (w: World, r: Rng) => {
    const side = r() < 0.5 ? 1 : -1;
    const n = count(w, 4);
    for (let i = 0; i < n; i++) later(w, i * 9, () => w.spawn(E.swoop, side > 0 ? 50 : W - 50, -20, { s: { side } }));
  },
  weavers: (w: World, r: Rng) => {
    const n = count(w, 2);
    for (let i = 0; i < n; i++) w.spawn(E.weaver, 50 + ((i + r()) * (W - 100)) / n, -20 - i * 30, { s: { ph: i } });
  },
  heavy: (w: World, r: Rng) => {
    const n = w.diff.D >= 6 ? 2 : 1;
    for (let i = 0; i < n; i++) {
      const x = n === 1 ? 70 + r() * (W - 140) : i ? 210 : 78;
      w.warn(x, 0, "top");
      later(w, 36, () => w.spawn(E.heavy, x, -40, { s: { ty: 80 + r() * 40 } }));
    }
  },
  gunboats: (w: World, r: Rng) => {
    const n = count(w, 2);
    for (let i = 0; i < n; i++) w.spawn(E.gunboat, 40 + ((i + 0.5) * (W - 80)) / n + (r() - 0.5) * 20, -60);
  },
  destroyer: (w: World, r: Rng) => {
    const x = r() < 0.5 ? 80 : 208;
    w.warn(x, 0, "top");
    later(w, 40, () => w.spawn(E.destroyer, x, -150));
  },
  /** Biome 1-2 lesson: darts cut across from the sides. */
  flank: (w: World, r: Rng) => {
    const side = r() < 0.5 ? 1 : -1;
    const y = 50 + r() * 140;
    w.warn(side > 0 ? 0 : W, y, side > 0 ? "left" : "right");
    const n = count(w, 3);
    for (let i = 0; i < n; i++) later(w, 36 + i * 12, () => w.spawn(E.dart, side > 0 ? -16 : W + 16, y + i * 6, { s: { vx: side * 2.4, vy: 0.3 } }));
  },
  /** Rear entries arc up from below the player. */
  rear: (w: World, r: Rng) => {
    const side = r() < 0.5 ? 1 : -1;
    const x = side > 0 ? 40 : W - 40;
    w.warn(x, H, "bottom");
    const n = count(w, 3);
    for (let i = 0; i < n; i++) later(w, 40 + i * 10, () => w.spawn(E.swoop, x, H + 20, { s: { side, up: true } }));
  },
  /** Volcanic sea: lava spouts bubble, then burst into bullet rings. */
  spouts: (w: World, r: Rng) => {
    const n = w.diff.D >= 5 ? 3 : 2;
    for (let i = 0; i < n; i++) {
      const x = 30 + r() * (W - 60), y = 40 + r() * 160;
      for (let k = 0; k < 8; k++) later(w, k * 6, () => w.fx.push({ kind: "ring", x: x + (w.rng() - 0.5) * 14, y: y + (w.rng() - 0.5) * 14, vx: 0, vy: w.scrollSpeed, t: 0, life: 14, s: 7, color: "#ff9a40" }));
      later(w, 50, () => { w.ring(x, y + w.scrollSpeed * 50, 10, 1.3, w.rng(), "orange"); w.boom(x, y + w.scrollSpeed * 50, 0.5); sfx("blast"); });
    }
  },
  /** Volcanic sea: turrets erupt from the water ahead. */
  surfacers: (w: World, r: Rng) => {
    const n = count(w, 2);
    for (let i = 0; i < n; i++) w.spawn(E.surfacer, 40 + r() * (W - 80), 40 + r() * 140);
  },
};

function templates(level: Level): Template[] {
  const b = level.biome;
  const tw = level.twist;
  const sea = b === 1 || b === 2;
  const list: Template[] = [
    { id: "zako", weight: 4, spawn: T.zako },
    { id: "darts", weight: 4, spawn: T.darts },
    { id: "swoops", weight: 3, minD: 0.5, spawn: T.swoops },
    { id: "weavers", weight: 2.5, minD: 1, spawn: T.weavers },
    { id: "heavy", weight: 1.5, minD: 1, spawn: T.heavy, cooldown: 14 },
  ];
  if (sea) list.push({ id: "gunboats", weight: 2, minD: 0.5, spawn: T.gunboats }, { id: "destroyer", weight: 0.8, minD: 2, spawn: T.destroyer, cooldown: 25 });
  if (tw === "flank" || tw === "omni") list.push({ id: "flank", weight: 2.5, spawn: T.flank }, { id: "rear", weight: 1.2, minD: 1, spawn: T.rear, cooldown: 8 });
  if (b === 2) list.push({ id: "spouts", weight: tw === "spouts" ? 3 : 1.5, spawn: T.spouts });
  if (tw === "erupt") list.push({ id: "surfacers", weight: 3, spawn: T.surfacers });
  return list;
}

function pickTemplate(r: Rng, list: Template[], D: number, t: number, lastUsed: Map<string, number>): Template {
  const ok = list.filter((x) => (x.minD ?? 0) <= D && t - (lastUsed.get(x.id) ?? -1e9) >= (x.cooldown ?? 0));
  const total = ok.reduce((s, x) => s + x.weight, 0);
  let v = r() * total;
  for (const x of ok) if ((v -= x.weight) < 0) return x;
  return ok[0];
}

// ---------------------------------------------------------------- setup

/** Seconds until the last listed strip fills the screen: the boss arena. */
const bossTime = (level: Level) => (STRIP_H + (level.strips.length - 1) * PERIOD - H) / (SCROLL * 60);

export function setupLevel(w: World) {
  const level = w.level;
  const biome = biomeOf(level);
  const r = levelSeed(level, w.tier);
  prepareBackground(level);
  w.scrollTarget = SCROLL;
  // The stage track starts with the sortie, on the carrier deck.
  playSong("stage");
  if (biome.carrier) {
    const carrier = img.carrier;
    w.bg.push({ img: carrier, x: W / 2 - carrier.width / 2, y: H - 120 - carrier.height * 0.8, speed: 1, layer: "sea", carrier: true });
  }
  level.strips.forEach((name, k) => {
    for (const [x, y] of GROUND[name] ?? []) w.scrollEvents.push({ at: scrollFor(k, y), fn: () => w.spawn(E.turret, x, -16) });
  });
  w.scrollEvents.sort((a, b) => a.at - b.at);

  const at = (t: number, fn: Spawn) => w.at(t, fn);
  const end = bossTime(level) - 5;
  const D = w.diff.D;
  const list = templates(level);
  const lastUsed = new Map<string, number>();
  // Wave spacing tightens with depth: ~4.5 s apart at 1-1, about 2.5 s by Orbit.
  const gap = 3.2 / w.diff.spawnMul;
  let t = 1.5;
  let nextCourier = 6;
  while (t < end) {
    if (t >= nextCourier) {
      const carry: "P" | "B" | "D" = D >= 1 && r() < 0.2 ? "D" : r() < 0.25 ? "B" : "P";
      const x = 60 + r() * (W - 120);
      at(t, (w) => w.spawn(E.courier, x, -20, { carry }));
      nextCourier += 15 + r() * 6;
      t += 1;
      continue;
    }
    const tpl = pickTemplate(r, list, D, t, lastUsed);
    lastUsed.set(tpl.id, t);
    // Each wave gets its own deterministic sub-seed so the layout is learnable.
    const sub = Math.floor(r() * 2 ** 31);
    at(t, (w) => tpl.spawn(w, mulberry32(sub)));
    t += gap * (0.75 + r() * 0.5) * (tpl.id === "heavy" || tpl.id === "destroyer" ? 1.6 : 1);
  }
  at(end + 1.5, (w) => { playSong(null); w.bossWarning = 150; sfx("warning"); });
  const bossDef = level.n === 1 ? E.guardian : BOSSES[biome.boss];
  at(end + 4.5, (w) => w.spawn(bossDef, W / 2, -120));
}
