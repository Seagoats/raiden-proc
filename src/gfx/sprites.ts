/** Runtime sprites: the composited player ship, Graftwing enemies, mounted weapons, bullets. */
import { img } from "./assets";
import { makeCanvas, silhouette } from "./screen";
import { buildShip, type Image as GwImage } from "./shipgen";
import type { WeaponType } from "../game/items";

export interface Sprite {
  c: HTMLCanvasElement;
  white: HTMLCanvasElement;
  shadow: HTMLCanvasElement;
  w: number;
  h: number;
  /** Anchor (hitbox / centre) within the canvas. */
  ax: number;
  ay: number;
}

export function toSprite(c: HTMLCanvasElement, ax = c.width / 2, ay = c.height / 2): Sprite {
  return { c, white: silhouette(c, "#fff"), shadow: silhouette(c, "#000"), w: c.width, h: c.height, ax, ay };
}

function gwToCanvas(im: GwImage, flip: boolean): HTMLCanvasElement {
  const [c, x] = makeCanvas(im.width, im.height);
  const id = x.createImageData(im.width, im.height);
  if (!flip) id.data.set(im.data);
  else for (let y = 0; y < im.height; y++) id.data.set(im.data.subarray(y * im.width * 4, (y + 1) * im.width * 4), (im.height - 1 - y) * im.width * 4);
  x.putImageData(id, 0, 0);
  return c;
}

// ---------------------------------------------------------------- palette recolour

function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  r /= 255; g /= 255; b /= 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
  const l = (mx + mn) / 2;
  if (mx === mn) return [0, 0, l];
  const d = mx - mn;
  const s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
  const h = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [h * 60, s, l];
}
function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  const c = (1 - Math.abs(2 * l - 1)) * s, x = c * (1 - Math.abs(((h / 60) % 2) - 1)), m = l - c / 2;
  const [r, g, b] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
  const q = (v: number) => Math.round(Math.round((v + m) * 31) * 255 / 31);
  return [q(r), q(g), q(b)];
}

/** Swap the parts' red accent panels to a chassis hue (and tint the white armour slightly). */
export function recolor(src: HTMLImageElement | HTMLCanvasElement, hue: number, armorTint = 0.06): HTMLCanvasElement {
  const [c, x] = makeCanvas(src.width, src.height);
  x.drawImage(src, 0, 0);
  const d = x.getImageData(0, 0, c.width, c.height);
  const p = d.data;
  for (let i = 0; i < p.length; i += 4) {
    if (!p[i + 3]) continue;
    const [h, s, l] = rgbToHsl(p[i], p[i + 1], p[i + 2]);
    let out: [number, number, number] | null = null;
    if ((h < 22 || h > 338) && s > 0.4) out = hslToRgb(hue, Math.min(1, s), hue > 40 && hue < 70 ? Math.min(0.62, l + 0.08) : l);
    else if (s < 0.15 && l > 0.45) out = hslToRgb(hue, armorTint, l);
    if (out) [p[i], p[i + 1], p[i + 2]] = out;
  }
  x.putImageData(d, 0, 0);
  return c;
}

// ---------------------------------------------------------------- mounted weapons (tiny pixel art)

const MINI: Record<WeaponType, string[]> = {
  vulcan: [".y.", ".g.", "dgd", "dgd", "ddd"],
  laser: [".c.", "cbc", "dgd", "dgd", "ddd"],
  plasma: [".pp.", "pPPp", "pPPp", ".dd."],
  dumbfire: [".r.", "wWw", "wWw", "wWw", "d.d"],
  homing: [".G.", "wWw", "wWw", "wWw", "G.G"],
};
const MINI_COL: Record<string, string> = {
  y: "#ffe860", g: "#9aa0a8", d: "#3a3e48", c: "#a8f0ff", b: "#3880f8", p: "#a040e0", P: "#f0a0ff",
  r: "#f04040", w: "#e8e8e8", W: "#b8b8c0", G: "#50e070",
};
export function drawMini(x: CanvasRenderingContext2D, type: WeaponType, cx: number, cy: number) {
  const rows = MINI[type];
  const w = rows[0].length;
  const ox = Math.round(cx - w / 2), oy = Math.round(cy - rows.length / 2);
  x.fillStyle = "#101018";
  rows.forEach((r, j) => [...r].forEach((ch, i) => ch !== "." && x.fillRect(ox + i - 1, oy + j, 3, 1)));
  rows.forEach((r, j) => [...r].forEach((ch, i) => {
    if (ch === ".") return;
    x.fillStyle = MINI_COL[ch];
    x.fillRect(ox + i, oy + j, 1, 1);
  }));
}

// ---------------------------------------------------------------- player ship

export interface MountPoint { x: number; y: number }
export interface PlayerShipSprite extends Sprite {
  /** Hardpoints relative to the anchor; pairs list [left, right]. */
  mains: MountPoint[][];
  ords: MountPoint[][];
  /** Nozzle positions relative to the anchor, for exhaust flicker. */
  nozzles: MountPoint[];
}

export interface PlayerLook {
  hull: number; wings: number; engine: number; hue: number;
  mains: (WeaponType | null)[];
  ords: (WeaponType | null)[];
}

const NOZZLES = [[0], [-5, 5], [-12, -4, 4, 12]];

export function buildPlayerShip(look: PlayerLook): PlayerShipSprite {
  const hull = recolor(img[`phull_${look.hull}`], look.hue);
  const wing = recolor(img[`pwing_${look.wings}`], look.hue);
  const eng = recolor(img[`pengine_${look.engine}`], look.hue);
  const W = Math.max(hull.width, wing.width, eng.width) + 6;
  const wingY = Math.round(hull.height * 0.5 - wing.height / 2) + 2;
  const engY = hull.height - 12;
  const H = Math.max(hull.height, engY + eng.height, wingY + wing.height) + 2;
  const [c, x] = makeCanvas(W, H);
  const cx = Math.floor(W / 2);
  x.drawImage(eng, cx - Math.floor(eng.width / 2), engY);
  x.drawImage(wing, cx - Math.floor(wing.width / 2), wingY);
  x.drawImage(hull, cx - Math.floor(hull.width / 2), 1);

  // Find the wing's leading edge at a column (in canvas coords).
  const wd = wing.getContext("2d")!.getImageData(0, 0, wing.width, wing.height).data;
  const wx0 = cx - Math.floor(wing.width / 2);
  const leading = (col: number) => {
    const lx = Math.max(0, Math.min(wing.width - 1, col - wx0));
    for (let y = 0; y < wing.height; y++) if (wd[(y * wing.width + lx) * 4 + 3]) return wingY + y;
    return wingY + wing.height / 2;
  };
  const half = wing.width / 2, hh = hull.width / 2;
  const at = (t: number, dy: number): MountPoint[] => {
    const off = Math.round(hh + (half - hh) * t);
    return [{ x: cx - off, y: leading(cx - off) + dy }, { x: cx + off - 1, y: leading(cx + off - 1) + dy }];
  };
  const mainMounts: MountPoint[][] = [[{ x: cx, y: 4 }], at(0.28, 2), at(0.62, 3)];
  const ordMounts: MountPoint[][] = [at(0.85, 5), [{ x: cx, y: Math.round(hull.height * 0.72) }], at(0.48, 6)];
  // Draw the build onto the ship.
  look.mains.forEach((w, i) => w && i > 0 && mainMounts[i].forEach((m) => drawMini(x, w, m.x, m.y)));
  look.ords.forEach((w, i) => w && i !== 1 && ordMounts[i].forEach((m) => drawMini(x, w, m.x, m.y + 1)));
  // The nose weapon sits on top of the hull.
  if (look.mains[0]) drawMini(x, look.mains[0], cx, 4);

  const ax = cx, ay = Math.round(hull.height * 0.42);
  const rel = (pts: MountPoint[][]) => pts.map((p) => p.map((m) => ({ x: m.x - ax, y: m.y - ay })));
  const sp = toSprite(c, ax, ay);
  const ns = NOZZLES[look.engine].map((dx) => ({ x: Math.round(dx * eng.width / [12, 20, 32][look.engine]), y: engY + eng.height - 6 - ay }));
  return { ...sp, mains: rel(mainMounts), ords: rel(ordMounts), nozzles: ns };
}

// ---------------------------------------------------------------- enemies (Graftwing)

export interface EnemyLookSpec { seed: number; size: number; style: number; power: number; hue: number; sat: number; bright: number; big: boolean }

export function buildEnemyShip(s: EnemyLookSpec): Sprite {
  const ship = buildShip({
    hull: { seed: s.seed, size: s.size },
    wings: { seed: s.seed + 1, style: s.style },
    engines: { seed: s.seed + 2, power: s.power },
    paint: { hue: s.hue, saturation: s.sat, brightness: s.bright, mech: 20 },
    maxW: s.big ? 64 : 34,
    maxH: s.big ? 60 : 34,
    small: !s.big,
  });
  return toSprite(gwToCanvas(ship.frames[1][0], true));
}

// ---------------------------------------------------------------- bullets & shots

function disc(r: number, ring: string, core: string, outline = "#200010"): HTMLCanvasElement {
  const s = r * 2 + 3;
  const [c, x] = makeCanvas(s, s);
  const m = s / 2;
  for (let y = 0; y < s; y++) for (let xx = 0; xx < s; xx++) {
    const d = Math.hypot(xx + 0.5 - m, y + 0.5 - m);
    if (d <= r + 1.2) { x.fillStyle = d <= r * 0.5 ? core : d <= r ? ring : outline; x.fillRect(xx, y, 1, 1); }
  }
  return c;
}

/** Enemy bullets: a reserved high-contrast palette that no player effect uses. */
export const BULLET = {
  small: disc(2.5, "#ff3a8a", "#ffffff"),
  big: disc(4.5, "#ff3a8a", "#fff0f8"),
  orange: disc(3, "#ff8a1a", "#fffbe0"),
  needle: (() => {
    const [c, x] = makeCanvas(5, 11);
    x.fillStyle = "#200010"; x.fillRect(0, 0, 5, 11);
    x.fillStyle = "#ff3a8a"; x.fillRect(1, 1, 3, 9);
    x.fillStyle = "#fff"; x.fillRect(2, 2, 1, 7);
    x.clearRect(0, 0, 1, 1); x.clearRect(4, 0, 1, 1); x.clearRect(0, 10, 1, 1); x.clearRect(4, 10, 1, 1);
    return c;
  })(),
};
export const BULLET_R = { small: 2.5, big: 4.5, orange: 3, needle: 2 };
export type BulletKind = keyof typeof BULLET;
export const BULLET_KINDS = Object.keys(BULLET) as BulletKind[];
