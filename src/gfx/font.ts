/** A 5x7 bitmap font drawn from glyph rows (bit 4 = leftmost column). */
import { ctx, makeCanvas } from "./screen";

const G: Record<string, number[]> = {
  A: [14, 17, 17, 31, 17, 17, 17], B: [30, 17, 17, 30, 17, 17, 30], C: [14, 17, 16, 16, 16, 17, 14],
  D: [30, 17, 17, 17, 17, 17, 30], E: [31, 16, 16, 30, 16, 16, 31], F: [31, 16, 16, 30, 16, 16, 16],
  G: [14, 17, 16, 23, 17, 17, 15], H: [17, 17, 17, 31, 17, 17, 17], I: [14, 4, 4, 4, 4, 4, 14],
  J: [7, 2, 2, 2, 2, 18, 12], K: [17, 18, 20, 24, 20, 18, 17], L: [16, 16, 16, 16, 16, 16, 31],
  M: [17, 27, 21, 21, 17, 17, 17], N: [17, 17, 25, 21, 19, 17, 17], O: [14, 17, 17, 17, 17, 17, 14],
  P: [30, 17, 17, 30, 16, 16, 16], Q: [14, 17, 17, 17, 21, 18, 13], R: [30, 17, 17, 30, 20, 18, 17],
  S: [15, 16, 16, 14, 1, 1, 30], T: [31, 4, 4, 4, 4, 4, 4], U: [17, 17, 17, 17, 17, 17, 14],
  V: [17, 17, 17, 17, 17, 10, 4], W: [17, 17, 17, 21, 21, 21, 10], X: [17, 17, 10, 4, 10, 17, 17],
  Y: [17, 17, 10, 4, 4, 4, 4], Z: [31, 1, 2, 4, 8, 16, 31],
  "0": [14, 17, 19, 21, 25, 17, 14], "1": [4, 12, 4, 4, 4, 4, 14], "2": [14, 17, 1, 2, 4, 8, 31],
  "3": [31, 2, 4, 2, 1, 17, 14], "4": [2, 6, 10, 18, 31, 2, 2], "5": [31, 16, 30, 1, 1, 17, 14],
  "6": [6, 8, 16, 30, 17, 17, 14], "7": [31, 1, 2, 4, 8, 8, 8], "8": [14, 17, 17, 14, 17, 17, 14],
  "9": [14, 17, 17, 15, 1, 2, 12],
  ".": [0, 0, 0, 0, 0, 12, 12], ",": [0, 0, 0, 0, 12, 4, 8], ":": [0, 12, 12, 0, 12, 12, 0],
  "!": [4, 4, 4, 4, 4, 0, 4], "?": [14, 17, 1, 2, 4, 0, 4], "-": [0, 0, 0, 31, 0, 0, 0],
  "+": [0, 4, 4, 31, 4, 4, 0], "%": [24, 25, 2, 4, 8, 19, 3], "/": [1, 1, 2, 4, 8, 16, 16],
  "(": [2, 4, 8, 8, 8, 4, 2], ")": [8, 4, 2, 2, 2, 4, 8], "'": [4, 4, 8, 0, 0, 0, 0],
  '"': [10, 10, 0, 0, 0, 0, 0], "#": [10, 10, 31, 10, 31, 10, 10], ">": [8, 4, 2, 1, 2, 4, 8],
  "<": [2, 4, 8, 16, 8, 4, 2], "=": [0, 0, 31, 0, 31, 0, 0], "*": [0, 4, 21, 14, 21, 4, 0],
  "[": [14, 8, 8, 8, 8, 8, 14], "]": [14, 2, 2, 2, 2, 2, 14], _: [0, 0, 0, 0, 0, 0, 31],
  "&": [12, 18, 20, 8, 21, 18, 13], "^": [4, 14, 21, 4, 4, 4, 4], "~": [0, 0, 8, 21, 2, 0, 0],
  "@": [14, 17, 23, 21, 23, 16, 14], "|": [4, 4, 4, 4, 4, 4, 4],
};
const CHARS = Object.keys(G);
export const CW = 6;
export const CH = 8;

const [atlas, ax] = makeCanvas(CHARS.length * CW, CH);
ax.fillStyle = "#fff";
CHARS.forEach((c, i) => G[c].forEach((row, y) => {
  for (let x = 0; x < 5; x++) if (row & (16 >> x)) ax.fillRect(i * CW + x, y, 1, 1);
}));
const index = new Map(CHARS.map((c, i) => [c, i]));
const tinted = new Map<string, HTMLCanvasElement>();

function tint(color: string): HTMLCanvasElement {
  let t = tinted.get(color);
  if (!t) {
    const [c, x] = makeCanvas(atlas.width, atlas.height);
    x.drawImage(atlas, 0, 0);
    x.globalCompositeOperation = "source-in";
    x.fillStyle = color;
    x.fillRect(0, 0, c.width, c.height);
    tinted.set(color, (t = c));
  }
  return t;
}

export interface TextOpts {
  color?: string;
  shadow?: string | null;
  align?: "left" | "center" | "right";
  scale?: number;
  target?: CanvasRenderingContext2D;
}

export function textWidth(s: string, scale = 1) {
  return s.length * CW * scale - scale;
}

export function text(s: string, x: number, y: number, o: TextOpts = {}) {
  const scale = o.scale ?? 1;
  const g = o.target ?? ctx;
  const w = textWidth(s, scale);
  let px = Math.round(o.align === "center" ? x - w / 2 : o.align === "right" ? x - w : x);
  const py = Math.round(y);
  const shadow = o.shadow === undefined ? "#000" : o.shadow;
  const draw = (img: HTMLCanvasElement, ox: number, oy: number) => {
    let cx = px + ox;
    for (const ch of s.toUpperCase()) {
      const i = index.get(ch);
      if (i !== undefined) g.drawImage(img, i * CW, 0, CW, CH, cx, py + oy, CW * scale, CH * scale);
      cx += CW * scale;
    }
  };
  if (shadow) draw(tint(shadow), scale, scale);
  draw(tint(o.color ?? "#fff"), 0, 0);
}

/** Word-wrap to a column count. */
export function wrap(s: string, cols: number): string[] {
  const out: string[] = [];
  let line = "";
  for (const word of s.split(" ")) {
    if (line && (line + " " + word).length > cols) {
      out.push(line);
      line = word;
    } else line = line ? line + " " + word : word;
  }
  if (line) out.push(line);
  return out;
}
