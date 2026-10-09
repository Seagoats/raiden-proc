// Contact sheet of generated ships: npx esbuild tools/sheet.ts --bundle --platform=node | node - out.png
import { buildShip } from "../src/gfx/shipgen";
import { writeFileSync } from "node:fs";
import { deflateSync } from "node:zlib";

function png(w: number, h: number, rgba: Uint8ClampedArray): Buffer {
  const crcT = new Int32Array(256).map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c; });
  const crc = (b: Buffer) => { let c = -1; for (const x of b) c = crcT[(c ^ x) & 255] ^ (c >>> 8); return (c ^ -1) >>> 0; };
  const chunk = (t: string, d: Buffer) => { const l = Buffer.alloc(4); l.writeUInt32BE(d.length); const td = Buffer.concat([Buffer.from(t), d]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([l, td, c]); };
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) { raw[y * (w * 4 + 1)] = 0; Buffer.from(rgba.buffer, y * w * 4, w * 4).copy(raw, y * (w * 4 + 1) + 1); }
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]);
}
const cell = 72, cols = 9, rows = 6, S = 3;
const W = cols * cell, H = rows * cell;
const out = new Uint8ClampedArray(W * H * 4);
for (let i = 0; i < W * H; i++) out.set([20, 40, 90, 255], i * 4);
const sizes: number[][] = [];
for (let i = 0; i < cols * rows; i++) {
  const enemy = i >= cols * 4;
  const s = buildShip({
    hull: { seed: 1000 + i, size: i % 3 }, wings: { seed: 2000 + i, style: (i >> 1) % 3 }, engines: { seed: 3000 + i, power: i % 3 },
    paint: enemy ? { hue: [0, 20, 90, 280][i % 4], saturation: 45, brightness: 32 } : { hue: [215, 0, 120, 45, 280][i % 5], saturation: 40, brightness: 40 },
    maxW: enemy ? 36 : 56, maxH: enemy ? 36 : 56, small: enemy,
  });
  sizes.push([s.width, s.height]);
  for (let b = 0; b < 3; b++) {
    const f = s.frames[b][0];
    const ox = (i % cols) * cell + 4, oy = Math.floor(i / cols) * cell + 4;
    if (b !== 1) continue;
    for (let y = 0; y < f.height; y++) for (let x = 0; x < f.width; x++) {
      const k = (y * f.width + x) * 4; if (!f.data[k + 3]) continue;
      const X = ox + x, Y = oy + y; if (X >= W || Y >= H) continue;
      out.set(f.data.subarray(k, k + 4), (Y * W + X) * 4);
    }
    for (const m of Object.values(s.mounts)) { const X = ox + m[0], Y = oy + m[1]; if (X < W && Y < H) out.set([255, 0, 255, 255], (Y * W + X) * 4); }
  }
}
const big = new Uint8ClampedArray(W * S * H * S * 4);
for (let y = 0; y < H * S; y++) for (let x = 0; x < W * S; x++) big.set(out.subarray(((y / S | 0) * W + (x / S | 0)) * 4, ((y / S | 0) * W + (x / S | 0)) * 4 + 4), (y * W * S + x) * 4);
writeFileSync(process.argv[2], png(W * S, H * S, big));
console.log(JSON.stringify(sizes));
