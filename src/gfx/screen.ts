/** The SNES-style framebuffer: a fixed low-res canvas scaled up with crisp pixels. */
export const W = 288;
export const H = 384;

export const canvas = document.getElementById("screen") as HTMLCanvasElement;
canvas.width = W;
canvas.height = H;
export const ctx = canvas.getContext("2d")!;
ctx.imageSmoothingEnabled = false;

export function fit() {
  const pad = 8;
  const sw = window.innerWidth - pad * 2;
  const sh = window.innerHeight - pad * 2;
  // Integer scale when it fits, otherwise the largest fractional scale.
  // Integer scale when it fills most of the window, otherwise the largest fractional scale.
  const fitS = Math.min(sw / W, sh / H);
  let s = Math.floor(fitS);
  if (s < 2 || s / fitS < 0.8) s = fitS;
  canvas.style.width = `${Math.floor(W * s)}px`;
  canvas.style.height = `${Math.floor(H * s)}px`;
}
window.addEventListener("resize", fit);
fit();

export function makeCanvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement("canvas");
  c.width = Math.max(1, Math.ceil(w));
  c.height = Math.max(1, Math.ceil(h));
  const x = c.getContext("2d")!;
  x.imageSmoothingEnabled = false;
  return [c, x];
}

/** A copy of an image with every opaque pixel set to one colour (hit flashes, shadows). */
export function silhouette(src: CanvasImageSource & { width: number; height: number }, color: string): HTMLCanvasElement {
  const [c, x] = makeCanvas(src.width, src.height);
  x.drawImage(src, 0, 0);
  x.globalCompositeOperation = "source-in";
  x.fillStyle = color;
  x.fillRect(0, 0, c.width, c.height);
  return c;
}

/** Snap an [r,g,b] colour to SNES 15-bit and return a CSS string. */
export function rgb555(r: number, g: number, b: number): string {
  const q = (v: number) => Math.round((Math.round((Math.max(0, Math.min(255, v)) / 255) * 31) * 255) / 31);
  return `rgb(${q(r)},${q(g)},${q(b)})`;
}
