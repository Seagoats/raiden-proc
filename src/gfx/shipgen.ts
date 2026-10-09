/**
 * Bridge to Graftwing (vendor/graftwing, tstone's ship designer). Every ship in
 * the game, player or enemy, is a Graftwing ship whose algorithm choices and
 * parameters are rolled from item seeds. This module stays DOM-free so it can
 * run in node for contact sheets.
 */
import {
  backAlgorithms,
  checkShip,
  cockpitAlgorithms,
  cockpitFrameAlgorithms,
  engineAlgorithms,
  finAlgorithms,
  frontAlgorithms,
  fuselageAlgorithms,
  fuselageShadingAlgorithms,
  generateShip,
  panelAlgorithms,
  paintAlgorithms,
  randomValue,
  renderShip,
  tailAlgorithms,
  weaponAlgorithms,
  wingDetailAlgorithms,
  wingShadingAlgorithms,
  defaultParams,
  type Algorithm,
  type GeneratedShip,
  type Image,
  type LightingAlgorithm,
  type Params,
  type ShipDesign,
  type Vec3,
} from "../../vendor/graftwing/designer/src/algorithms";
import { hash, mulberry32, type Rng } from "../core/rng";

export type { Image };

/** A parameter override: a fixed value or an inclusive [min, max] range (snapped to the param's step). */
type Override = number | [number, number];

interface Part<A extends Algorithm> {
  algorithm: A;
  params: Params;
}

function roll<A extends Algorithm>(algs: A[], r: Rng, ov: Record<string, Override> = {}, index?: number): Part<A> {
  const algorithm = algs[index ?? Math.floor(r() * algs.length)];
  const params: Params = {};
  for (const s of algorithm.params) {
    const o = ov[s.key];
    if (typeof o === "number") params[s.key] = o;
    else if (o) {
      const step = "step" in s && s.step ? s.step : 1;
      params[s.key] = o[0] + Math.floor(r() * (Math.floor((o[1] - o[0]) / step) + 1)) * step;
    } else params[s.key] = randomValue(s, r);
  }
  return { algorithm, params };
}

export interface ShipSpec {
  /** Hull: fuselage, cockpit, panels and paint. size 0 light, 1 medium, 2 heavy. */
  hull: { seed: number; size: number };
  /** Wings: wing shape, wing details, fins, built-in guns. style 0 gunship, 1 balanced, 2 bomber. */
  wings: { seed: number; style: number };
  /** Engines: pods and tail. power 0..2. */
  engines: { seed: number; power: number };
  paint: { hue: number; saturation: number; brightness: number; mech?: number };
  maxW: number;
  maxH: number;
  /** Scales every size range down (enemy fighters). */
  small?: boolean;
}

export interface Mounts {
  nose: [number, number];
  inner: [number, number];
  outer: [number, number];
  belly: [number, number];
  tip: [number, number];
}

export interface ShipSprite {
  /** frames[bank][flame]: bank 0 left, 1 level, 2 right; flame 0/1 flicker. */
  frames: Image[][];
  width: number;
  height: number;
  mounts: Mounts;
  /** Fuselage width in px: drives hitbox placement and the cockpit core. */
  bodyWidth: number;
}

const light = (azimuthDeg: number, heightDeg = 45): LightingAlgorithm => {
  const [a, h] = [(azimuthDeg * Math.PI) / 180, (heightDeg * Math.PI) / 180];
  const toLight: Vec3 = [Math.sin(a) * Math.cos(h), -Math.cos(a) * Math.cos(h), Math.sin(h)];
  return { id: "light", name: "Light", params: [], generate: () => ({ toLight }) };
};
const LIGHTS = [light(260, 35), light(315), light(10, 35)];

const SIZE = {
  width: [
    [10, 12],
    [14, 16],
    [18, 20],
  ],
  height: [
    [15, 21],
    [18, 25],
    [22, 30],
  ],
} as const;

function design(spec: ShipSpec, attempt: number) {
  const hr = mulberry32(hash(spec.hull.seed, 1));
  // Wings, cockpit and engines re-roll on retries; the fuselage and paint are the hull's identity.
  const wr = mulberry32(hash(spec.wings.seed, 2, attempt));
  const er = mulberry32(hash(spec.engines.seed, 3, attempt));
  const cr = mulberry32(hash(spec.hull.seed, 4, attempt));
  const s = Math.max(0, Math.min(2, spec.hull.size));
  const small = spec.small ? 0.7 : 1;
  const sz = (v: readonly [number, number]): [number, number] => [Math.round(v[0] * small), Math.round(v[1] * small)];
  const fw = SIZE.width[s];
  const fuselage = roll(fuselageAlgorithms, hr, {
    width: spec.small ? [10, 12] : [fw[0], fw[1]],
    height: sz(SIZE.height[s]),
  });
  const style = spec.wings.style;
  // Bombers favour bat wings, gunships faceted ones.
  const frontIndex = style === 0 ? 0 : style === 2 ? (wr() < 0.7 ? 1 : 0) : wr() < 0.5 ? 0 : 1;
  const facet: [number, number] = style === 2 ? [3, 12] : [2, 9];
  const front = roll(
    frontAlgorithms,
    wr,
    {
      facets: [1, 3],
      width1: sz(facet),
      width2: sz(facet),
      width3: sz(facet),
      height1: sz([3, 14]),
      height2: sz([2, 10]),
      height3: sz([1, 8]),
      span: sz(style === 2 ? [16, 26] : [10, 20]),
    },
    frontIndex,
  );
  const back = roll(backAlgorithms, wr, {}, front.algorithm.id === "batWing" && wr() < 0.6 ? 1 : 0);
  const shape: ShipDesign = { fuselage, front, back };

  const p = spec.paint;
  const paint = roll(paintAlgorithms, hr, {
    hue: Math.round(p.hue),
    saturation: Math.round(p.saturation),
    brightness: Math.round(p.brightness),
    ...(p.mech !== undefined ? { mech: p.mech } : {}),
  });
  const pw = spec.engines.power;
  const render = {
    cockpit: roll(cockpitAlgorithms, cr, { width: 8, length: [12, 16] }),
    cockpitFrame: roll(cockpitFrameAlgorithms, hr),
    engines: roll(engineAlgorithms, er, {
      count: pw === 0 ? 1 : pw === 1 ? [1, 2] : [2, 3],
      length: sz([7, 14]),
      exhaust: [3, 7],
      layer: [0, 1],
    }),
    panels: roll(panelAlgorithms, hr),
    tail: roll(tailAlgorithms, er),
    wingDetail: roll(wingDetailAlgorithms, wr),
    fins: roll(finAlgorithms, wr),
    weapons: roll(weaponAlgorithms, wr),
    paint,
    wingShading: { algorithm: wingShadingAlgorithms[0], params: defaultParams(wingShadingAlgorithms[0]) },
    fuselageShading: { algorithm: fuselageShadingAlgorithms[0], params: defaultParams(fuselageShadingAlgorithms[0]) },
  };
  return { shape, render };
}

function violations(ship: GeneratedShip, render: ReturnType<typeof design>["render"]): number {
  return checkShip({
    ...ship,
    cockpit: render.cockpit.algorithm.generate(render.cockpit.params, ship),
    engines: render.engines.algorithm.generate(render.engines.params, ship),
  }).length;
}

const cache = new Map<string, ShipSprite>();

/** Build (or fetch) a ship sprite. Deterministic in the spec. */
export function buildShip(spec: ShipSpec): ShipSprite {
  const key = JSON.stringify(spec);
  const hit = cache.get(key);
  if (hit) return hit;

  let best: { d: ReturnType<typeof design>; ship: GeneratedShip; score: number } | null = null;
  for (let attempt = 0; attempt < 400; attempt++) {
    const d = design(spec, attempt);
    const ship = generateShip(d.shape);
    let score = violations(ship, d.render) * 10;
    const img = renderShip(ship, { ...d.render, lighting: { algorithm: LIGHTS[1], params: {} } });
    if (img.width > spec.maxW) score += 5 + (img.width - spec.maxW);
    if (img.height > spec.maxH) score += 5 + (img.height - spec.maxH);
    if (!best || score < best.score) best = { d, ship, score };
    if (score === 0) break;
  }
  const { d, ship } = best!;
  const frames = LIGHTS.map((L) =>
    [0, 2].map((extra) => {
      const engines = { ...d.render.engines, params: { ...d.render.engines.params, exhaust: d.render.engines.params.exhaust + extra } };
      return renderShip(ship, { ...d.render, engines, lighting: { algorithm: L, params: {} } });
    }),
  );
  // Flicker frames differ in height; pad all to the tallest so they share an origin.
  const width = Math.max(...frames.flat().map((f) => f.width));
  const height = Math.max(...frames.flat().map((f) => f.height));
  const padded = frames.map((row) => row.map((f) => pad(f, width, height)));
  const sprite: ShipSprite = {
    frames: padded,
    width,
    height,
    mounts: findMounts(padded[1][0], d.shape.fuselage.params.width),
    bodyWidth: d.shape.fuselage.params.width,
  };
  cache.set(key, sprite);
  return sprite;
}

function pad(img: Image, w: number, h: number): Image {
  if (img.width === w && img.height === h) return img;
  const data = new Uint8ClampedArray(w * h * 4);
  const ox = Math.floor((w - img.width) / 2);
  for (let y = 0; y < img.height; y++) data.set(img.data.subarray(y * img.width * 4, (y + 1) * img.width * 4), ((y * w) + ox) * 4);
  return { width: w, height: h, data };
}

/** Hardpoint positions (left side, image coordinates), found by scanning the rendered silhouette. */
function findMounts(img: Image, bodyWidth: number): Mounts {
  const { width: w, height: h, data } = img;
  const solid = (x: number, y: number) => data[(y * w + x) * 4 + 3] > 0;
  const top = (x: number) => {
    for (let y = 0; y < h; y++) if (solid(x, y)) return y;
    return h >> 1;
  };
  const bottom = (x: number) => {
    for (let y = h - 1; y >= 0; y--) if (solid(x, y)) return y;
    return h >> 1;
  };
  const cx = Math.floor(w / 2) - 1;
  let tipX = 0;
  while (tipX < cx && ![...Array(h).keys()].some((y) => solid(tipX, y))) tipX++;
  const root = cx - Math.floor(bodyWidth / 2);
  const along = (t: number) => Math.round(root + (tipX - root) * t);
  const ix = along(0.3);
  const ox = along(0.65);
  const tx = along(0.92);
  return {
    nose: [cx, top(cx)],
    inner: [ix, top(ix) + 3],
    outer: [ox, top(ox) + 3],
    tip: [tx, top(tx) + 2],
    belly: [cx, Math.round((top(cx) + bottom(cx)) * 0.55)],
  };
}
