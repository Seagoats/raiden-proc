/** Shared UI bits: tier names, item icons, item cards. */
import { ctx } from "../gfx/screen";
import { text, wrap } from "../gfx/font";
import { img } from "../gfx/assets";
import { BASES, RARITY_COLOR, RARITY_NAME, roll, type Item } from "../game/items";
import { engineSpeedMul, hullCapacity } from "../game/stats";

export const tierName = (t: number) => (t === 0 ? "NORMAL" : `HELL ${t}`);

export function drawIcon(item: Item | null, x: number, y: number, size = 16) {
  ctx.fillStyle = "#000";
  ctx.fillRect(x, y, size, size);
  if (!item) return;
  ctx.drawImage(img[`icons_${BASES[item.base].icon}`], x + 1, y + 1, size - 2, size - 2);
  ctx.strokeStyle = RARITY_COLOR[item.rarity];
  ctx.strokeRect(x + 0.5, y + 0.5, size - 1, size - 1);
}

export function panel(x: number, y: number, w: number, h: number, border = "#5a6a90") {
  ctx.fillStyle = "rgba(8,12,28,0.88)";
  ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = border;
  ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
  ctx.strokeStyle = "rgba(255,255,255,0.08)";
  ctx.strokeRect(x + 1.5, y + 1.5, w - 3, h - 3);
}

/** Base-stat lines for an item. */
export function baseLines(item: Item): string[] {
  const r = roll(item);
  const d = r.def;
  const m = r.levelMul;
  const out: string[] = [];
  if (d.slot === "hull") out.push(`ENERGY CAP ${hullCapacity(item)}`, `HITS ${d.hp}  SHIELDS ${d.shields}`, `HITBOX ${["TINY", "SMALL", "LARGE"][d.size!]}`);
  if (d.slot === "wings") out.push(`MAIN ${d.mains}  ORDNANCE ${d.ords}  BOMB 1`, `PRECISION x${d.precision}`);
  if (d.slot === "engine") out.push(`LATERAL ${(d.lat! * engineSpeedMul(item)).toFixed(2)}`, `VERTICAL ${(d.vert! * engineSpeedMul(item)).toFixed(2)}`);
  if (d.weapon) {
    if (d.weapon === "plasma") out.push(`${Math.round(d.damage! * m)} DPS PER STRAND`, `STRANDS ${d.amount}`);
    else out.push(`DMG ${(d.damage! * m).toFixed(1)}  RATE ${d.rate}/S`, `AMOUNT ${d.amount}${d.pierce ? `  PIERCE ${d.pierce}` : ""}`);
  }
  if (d.bomb) out.push(`STOCK ${d.stock}`, d.bomb === "nuke" ? "SCREEN-WIDE BLAST" : "HOMING BOMBLETS");
  if (d.energy) out.push(`DRAWS ${d.energy} ENERGY`);
  return out;
}

/** Draws an item card; returns its height. */
export function itemCard(item: Item, x: number, y: number, w: number, extra: string[] = []): number {
  const r = roll(item);
  const cols = Math.floor((w - 8) / 6);
  const lines: [string, string][] = [];
  for (const l of wrap(r.name.toUpperCase(), cols)) lines.push([l, RARITY_COLOR[item.rarity]]);
  if (item.rarity >= 2 || r.name !== r.def.name) lines.push([r.def.name.toUpperCase(), "#9aa"]);
  lines.push([`${RARITY_NAME[item.rarity].toUpperCase()}  ILVL ${item.ilvl}`, "#778"]);
  for (const l of baseLines(item)) for (const s of wrap(l, cols)) lines.push([s, "#ccd"]);
  for (const l of r.lines) for (const s of wrap(l, cols)) lines.push([s, "#8af"]);
  if (r.effect) for (const s of wrap(r.effect, cols)) lines.push([s, "#ffa040"]);
  for (const l of extra) for (const s of wrap(l, cols)) lines.push([s, l.startsWith("!") ? "#f66" : "#8f8"]);
  const h = lines.length * 9 + 8;
  panel(x, y, w, h, RARITY_COLOR[item.rarity]);
  lines.forEach(([s, c], i) => text(s.replace(/^!/, ""), x + 4, y + 4 + i * 9, { color: c }));
  return h;
}
