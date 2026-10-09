/**
 * Biome 1, level 1: Coastal launch. The background is a stack of Codex-painted
 * strips crossfaded over open water; the last strip loops for the boss arena.
 * Waves are data: a time (seconds after launch) and a spawn function.
 */
import { img } from "../gfx/assets";
import { makeCanvas, W, H } from "../gfx/screen";
import { sfx, playSong, voice } from "../core/audio";
import { E } from "./enemies";
import type { World } from "./world";

export const STRIPS = ["bg_01", "bg_02", "bg_03", "bg_04", "bg_05", "bg_06", "bg_07"];
export const STRIP_H = 432;
export const OVERLAP = 64;
export const PERIOD = STRIP_H - OVERLAP;
export const SCROLL = 0.4;

interface Strip { faded: HTMLCanvasElement; plain: HTMLCanvasElement; shimmer: HTMLCanvasElement[] }
let strips: Strip[] | null = null;

/** Build faded-bottom copies and water-shimmer frames for every strip (once). */
export function prepareBackground() {
  if (strips) return;
  const names = STRIPS.filter((n) => img[n]);
  strips = names.map((n) => {
    const src = img[n];
    const [plain, px] = makeCanvas(W, STRIP_H);
    px.drawImage(src, 0, 0, W, STRIP_H);
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
    // Palette-cycle style shimmer: sparse highlights on water pixels, four phases.
    const d = px.getImageData(0, 0, W, STRIP_H).data;
    const shimmer = [0, 1, 2, 3].map((k) => {
      const [c, x] = makeCanvas(W, STRIP_H);
      const out = x.createImageData(W, STRIP_H);
      const o = out.data;
      const ph = (k * Math.PI) / 2;
      for (let y = 0; y < STRIP_H; y++) for (let xx = 0; xx < W; xx++) {
        const i = (y * W + xx) * 4;
        const [r, gg, b] = [d[i], d[i + 1], d[i + 2]];
        if (!(b > 70 && b > r * 1.5 && b > gg * 1.08)) continue;
        const f = Math.sin(xx * 0.55 + y * 0.2 + ph) + Math.sin(xx * 0.23 - y * 0.41 + ph * 1.5) + Math.sin(y * 0.9 - ph);
        if (f < 2.1) continue;
        const fade = y > STRIP_H - OVERLAP ? 1 - (y - (STRIP_H - OVERLAP)) / OVERLAP : 1;
        o[i] = Math.min(255, r + 70); o[i + 1] = Math.min(255, gg + 80); o[i + 2] = Math.min(255, b + 60); o[i + 3] = 200 * fade;
      }
      x.putImageData(out, 0, 0);
      return c;
    });
    return { faded, plain, shimmer };
  });
}

/** Screen y of segment k's top for a given scroll. Segments past the last strip repeat it. */
const segTop = (k: number, scrolled: number) => H - STRIP_H - k * PERIOD + scrolled;

export function drawBackground(g: CanvasRenderingContext2D, scrolled: number, t: number) {
  if (!strips?.length) { g.fillStyle = "#14408a"; g.fillRect(0, 0, W, H); return; }
  const first = Math.max(0, Math.floor((scrolled - STRIP_H) / PERIOD));
  const frame = Math.floor(t / 10) % 4;
  for (let k = first; k < first + 3; k++) {
    const y = Math.round(segTop(k, scrolled));
    if (y > H || y + STRIP_H < 0) continue;
    const s = strips[Math.min(k, strips.length - 1)];
    g.drawImage(k === 0 ? s.plain : s.faded, 0, y);
    g.drawImage(s.shimmer[frame], 0, y);
  }
}

/** Scroll value at which a point in strip k (at strip-local y) reaches the top of the screen. */
export const scrollFor = (k: number, sy: number) => STRIP_H + k * PERIOD - H - sy - 16;

// ---------------------------------------------------------------- wave helpers

function zakoRow(w: World, y: number, dir: 1 | -1, n = 6) {
  for (let i = 0; i < n; i++) {
    const x = dir > 0 ? -20 - i * 22 : W + 20 + i * 22;
    w.spawn(E.zako, x, y, { s: { dir } });
  }
}
function darts(w: World, xs: number[], gap = 0) {
  xs.forEach((x, i) => setDelay(w, i * gap, () => w.spawn(E.dart, x, -20)));
}
function swoops(w: World, side: 1 | -1, n = 5) {
  for (let i = 0; i < n; i++) setDelay(w, i * 9, () => w.spawn(E.swoop, side > 0 ? 50 : W - 50, -20, { s: { side } }));
}
function weavers(w: World, xs: number[]) {
  xs.forEach((x, i) => w.spawn(E.weaver, x, -20 - i * 30, { s: { ph: i } }));
}
function heavy(w: World, x: number, ty = 90, carry?: "P" | "B" | "D") {
  w.warn(x, 0, "top");
  setDelay(w, 36, () => w.spawn(E.heavy, x, -40, { s: { ty }, carry }));
}
function courier(w: World, x: number, carry: "P" | "B" | "D") {
  w.spawn(E.courier, x, -20, { carry });
}
function gunboats(w: World, xs: number[]) {
  xs.forEach((x) => w.spawn(E.gunboat, x, -60));
}
function destroyer(w: World, x: number) {
  w.warn(x, 0, "top");
  setDelay(w, 40, () => w.spawn(E.destroyer, x, -150));
}

/** A delayed one-off, measured in ticks from now. */
function setDelay(w: World, ticks: number, fn: () => void) {
  if (ticks <= 0) return fn();
  w.pending.push({ at: w.t + ticks, fn });
}

// ---------------------------------------------------------------- the script

/** Ground emplacements painted onto strips: [strip, x, y]. */
export const GROUND: [number, number, number][] = [
  [4, 175, 95], [4, 255, 140], [4, 205, 230], [4, 250, 300], [4, 160, 300],
  [5, 75, 85], [5, 225, 145], [5, 140, 190], [5, 55, 250], [5, 250, 270], [5, 150, 330],
];

export function setupStage(w: World) {
  prepareBackground();
  // Carrier for the launch.
  const carrier = img.carrier;
  const cx = W / 2 - carrier.width / 2;
  const obj = { img: carrier, x: cx, y: H - 120 - carrier.height * 0.8, speed: 1, layer: "sea" as const, carrier: true };
  w.bg.push(obj);
  w.scrollTarget = SCROLL;
  for (const [k, x, y] of GROUND) w.scrollEvents.push({ at: scrollFor(k, y), fn: () => w.spawn(E.turret, x, -16) });
  w.scrollEvents.sort((a, b) => a.at - b.at);

  const s = (t: number, fn: (w: World) => void) => w.at(t, fn);
  s(0.1, () => playSong("stage"));
  // bg_01: open ocean.
  s(1.0, (w) => zakoRow(w, 70, 1));
  s(3.5, (w) => darts(w, [60, 110, 160], 10));
  s(5.5, (w) => darts(w, [230, 180, 130], 10));
  s(7.0, (w) => courier(w, W / 2, "P"));
  s(9.0, (w) => swoops(w, 1));
  s(11.5, (w) => swoops(w, -1));
  s(14.0, (w) => zakoRow(w, 100, -1, 8));
  // bg_02: islets.
  s(16.0, (w) => gunboats(w, [70, 218]));
  s(18.0, (w) => weavers(w, [80, 144, 208]));
  s(21.0, (w) => heavy(w, W / 2, 90, "D"));
  s(25.0, (w) => { darts(w, [40, 80], 12); darts(w, [248, 208], 12); });
  s(27.0, (w) => swoops(w, 1, 6));
  s(29.0, (w) => gunboats(w, [50, 144, 238]));
  // bg_03: reef.
  s(31.0, (w) => courier(w, 90, "B"));
  s(33.0, (w) => { zakoRow(w, 60, 1); zakoRow(w, 110, -1); });
  s(36.0, (w) => { heavy(w, 80, 80); heavy(w, 208, 110, "P"); });
  s(41.0, (w) => { swoops(w, 1); swoops(w, -1); });
  s(44.0, (w) => destroyer(w, 200));
  s(46.0, (w) => darts(w, [40, 70, 100], 14));
  // bg_04: island village.
  s(50.0, (w) => { courier(w, 200, "P"); weavers(w, [60, 120, 180, 240]); });
  s(54.0, (w) => heavy(w, W / 2, 100, "D"));
  s(58.0, (w) => { zakoRow(w, 80, -1, 8); gunboats(w, [60, 230]); });
  s(61.0, (w) => swoops(w, -1, 6));
  // bg_05: naval base (ground emplacements spawn from the scroll).
  s(64.0, (w) => darts(w, [50, 100, 150, 200, 250], 8));
  s(67.0, (w) => destroyer(w, 80));
  s(70.0, (w) => courier(w, W / 2, "D"));
  s(72.0, (w) => { heavy(w, 70, 90); heavy(w, 218, 90); });
  s(77.0, (w) => { zakoRow(w, 60, 1, 8); zakoRow(w, 120, -1, 8); });
  // bg_06: coastal fortress.
  s(80.0, (w) => weavers(w, [70, 144, 218]));
  s(83.0, (w) => { swoops(w, 1); swoops(w, -1); });
  s(86.0, (w) => { heavy(w, 60, 80); heavy(w, W / 2, 120, "D"); heavy(w, 228, 80); });
  s(91.0, (w) => { courier(w, 80, "P"); courier(w, 208, "B"); });
  s(94.0, (w) => darts(w, [30, 70, 110, 150, 190, 230, 260], 6));
  // bg_07: storm sea, boss arena.
  s(98.0, (w) => { zakoRow(w, 70, 1, 10); });
  s(101.0, (w) => gunboats(w, [60, 144, 228]));
  // Popcorn filler so the screen never goes quiet.
  const filler: [number, (w: World) => void][] = [
    [2.5, (w) => zakoRow(w, 46, -1)], [8.0, (w) => darts(w, [200, 240], 10)], [12.5, (w) => weavers(w, [100, 188])],
    [17.0, (w) => zakoRow(w, 54, 1)], [19.5, (w) => darts(w, [40, 248], 0)], [23.0, (w) => swoops(w, -1)],
    [26.0, (w) => zakoRow(w, 70, -1)], [34.5, (w) => darts(w, [144, 110, 178], 8)], [39.0, (w) => weavers(w, [60, 228])],
    [42.0, (w) => { zakoRow(w, 50, 1); zakoRow(w, 96, -1); }], [48.0, (w) => swoops(w, 1)], [52.0, (w) => darts(w, [70, 218], 0)],
    [56.0, (w) => zakoRow(w, 60, 1, 8)], [60.0, (w) => weavers(w, [90, 198])], [63.0, (w) => swoops(w, 1)],
    [66.0, (w) => zakoRow(w, 44, -1, 8)], [69.0, (w) => darts(w, [40, 90, 198, 248], 6)], [75.0, (w) => swoops(w, -1)],
    [79.0, (w) => darts(w, [144, 100, 188], 6)], [82.0, (w) => zakoRow(w, 64, 1, 8)], [88.0, (w) => weavers(w, [50, 238])],
    [92.0, (w) => swoops(w, 1, 6)], [96.0, (w) => zakoRow(w, 90, -1, 10)], [103.0, (w) => weavers(w, [80, 144, 208])],
  ];
  for (const [t, fn] of filler) s(t, fn);
  s(106.0, (w) => { playSong(null); w.bossWarning = 150; sfx("warning"); w.pending.push({ at: w.t + 40, fn: () => voice("v_attack", 2) }); });
  s(109.0, (w) => w.spawn(E.boss, W / 2, -120));
}
