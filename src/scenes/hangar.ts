/**
 * The hangar as a schematic: the ship drawn as a blueprint with slot callouts
 * wired to the hardpoints they occupy, a stats strip, and a large detail panel.
 * Choosing a slot opens the stash picker, which previews the swap on the ship.
 */
import { ctx, W, H, makeCanvas } from "../gfx/screen";
import { text, wrap } from "../gfx/font";
import { img } from "../gfx/assets";
import { mouse, pressed, repeat } from "../core/input";
import { sfx, playSong } from "../core/audio";
import { buildPlayerShip, type PlayerShipSprite, type MountPoint } from "../gfx/sprites";
import { profile, save, stashMap } from "../game/save";
import { BASES, RARITY_COLOR, RARITY_NAME, roll, type Item, type Slot } from "../game/items";
import { computeBuild, type Build, type Loadout } from "../game/stats";
import { setScene, type Scene } from "./scene";
import { baseLines, drawIcon, panel } from "./common";

/** Items picked up in the last sortie, flagged NEW until viewed. */
export const newLoot = new Set<number>();

interface SlotDef { label: string; slot: Slot; key: "hull" | "wings" | "engine" | "bomb" | "main" | "ord"; index: number; side: "L" | "R"; y: number }
const SLOTS: SlotDef[] = [
  { label: "HULL", slot: "hull", key: "hull", index: 0, side: "L", y: 22 },
  { label: "WINGS", slot: "wings", key: "wings", index: 0, side: "L", y: 56 },
  { label: "ENGINE", slot: "engine", key: "engine", index: 0, side: "L", y: 90 },
  { label: "BOMB", slot: "bomb", key: "bomb", index: 0, side: "L", y: 124 },
  { label: "MAIN 1", slot: "main", key: "main", index: 0, side: "R", y: 18 },
  { label: "MAIN 2", slot: "main", key: "main", index: 1, side: "R", y: 42 },
  { label: "MAIN 3", slot: "main", key: "main", index: 2, side: "R", y: 66 },
  { label: "ORD 1", slot: "ord", key: "ord", index: 0, side: "R", y: 90 },
  { label: "ORD 2", slot: "ord", key: "ord", index: 1, side: "R", y: 114 },
  { label: "ORD 3", slot: "ord", key: "ord", index: 2, side: "R", y: 138 },
];
const BOX_W = 76;
const BOX_H = 22;
const SHIP_X = W / 2;
const SHIP_Y = 84;
const LIST_Y = 192;
const VISIBLE = 13;

let grid: HTMLCanvasElement | null = null;
function blueprint(): HTMLCanvasElement {
  if (grid) return grid;
  const [c, x] = makeCanvas(W, H);
  x.fillStyle = "#081633";
  x.fillRect(0, 0, W, H);
  for (let i = 0; i < W; i += 8) { x.fillStyle = i % 32 === 0 ? "#163066" : "#0e2149"; x.fillRect(i, 0, 1, H); }
  for (let j = 0; j < H; j += 8) { x.fillStyle = j % 32 === 0 ? "#163066" : "#0e2149"; x.fillRect(0, j, W, 1); }
  return (grid = c);
}

export class HangarScene implements Scene {
  cursor = 0;
  mode: "slots" | "pick" = "slots";
  pick = 0;
  scroll = 0;
  build!: Build;
  ship!: PlayerShipSprite;
  preview: { ship: PlayerShipSprite; build: Build } | null = null;
  t = 0;
  msg = "";
  msgT = 0;

  enter() {
    playSong("hangar");
    this.refresh();
  }

  refresh() {
    this.build = computeBuild(stashMap(), profile.loadout);
    this.ship = buildPlayerShip(this.build.look);
  }

  equipped(s: SlotDef, lo: Loadout = profile.loadout): number | null {
    return s.key === "main" || s.key === "ord" ? lo[s.key][s.index] : lo[s.key];
  }
  withItem(s: SlotDef, id: number | null): Loadout {
    const lo = structuredClone(profile.loadout);
    if (s.key === "main" || s.key === "ord") {
      // An item can only sit in one hardpoint.
      for (const k of ["main", "ord"] as const) lo[k] = lo[k].map((x) => (x === id ? null : x));
      lo[s.key][s.index] = id;
    } else lo[s.key] = id;
    return lo;
  }
  enabled(s: SlotDef, b: Build = this.build) {
    if (s.key === "main") return s.index < b.mainSlots;
    if (s.key === "ord") return s.index < b.ordSlots;
    return true;
  }
  isEquipped(id: number) {
    const lo = profile.loadout;
    return lo.hull === id || lo.wings === id || lo.engine === id || lo.bomb === id || lo.main.includes(id) || lo.ord.includes(id);
  }
  candidates(s: SlotDef): (Item | null)[] {
    const items = profile.stash
      .filter((i) => BASES[i.base].slot === s.slot)
      .sort((a, b) => Number(newLoot.has(b.id)) - Number(newLoot.has(a.id)) || b.rarity - a.rarity || b.ilvl - a.ilvl || a.base.localeCompare(b.base));
    return s.key === "main" || s.key === "ord" || s.key === "bomb" ? [null, ...items] : items;
  }
  flash(m: string) { this.msg = m; this.msgT = 110; }

  // ------------------------------------------------------------ input

  update() {
    this.t++;
    if (this.msgT > 0) this.msgT--;
    if (this.mode === "slots") this.updateSlots();
    else this.updatePick();
  }

  updateSlots() {
    const n = SLOTS.length;
    if (repeat("down")) { this.cursor = (this.cursor + 1) % n; sfx("move"); }
    if (repeat("up")) { this.cursor = (this.cursor + n - 1) % n; sfx("move"); }
    if (repeat("left") || repeat("right")) {
      // Jump to the nearest box in the other column.
      const cur = SLOTS[this.cursor];
      const other = SLOTS.map((s, i) => [s, i] as const).filter(([s]) => s.side !== cur.side);
      this.cursor = other.reduce((best, [s, i]) => (Math.abs(s.y - cur.y) < Math.abs(SLOTS[best].y - cur.y) ? i : best), other[0][1]);
      sfx("move");
    }
    let clicked = false;
    if (mouse.moved || mouse.clicked) {
      const hit = SLOTS.findIndex((s) => {
        const bx = s.side === "L" ? 4 : W - 4 - BOX_W;
        return mouse.x >= bx && mouse.x < bx + BOX_W && mouse.y >= s.y && mouse.y < s.y + BOX_H;
      });
      if (hit >= 0) {
        if (hit !== this.cursor && mouse.moved) sfx("move");
        this.cursor = hit;
        clicked = mouse.clicked;
      }
    }
    if (pressed("ok") || clicked) {
      const s = SLOTS[this.cursor];
      if (!this.enabled(s)) { sfx("deny"); this.flash("THESE WINGS HAVE NO SUCH HARDPOINT"); return; }
      this.mode = "pick";
      const list = this.candidates(s);
      const eq = this.equipped(s);
      this.pick = Math.max(0, list.findIndex((i) => (i ? i.id : null) === eq));
      this.scroll = Math.max(0, this.pick - VISIBLE + 3);
      this.updatePreview();
      sfx("select");
    }
    if (pressed("back")) { sfx("select"); void import("./map").then((m) => setScene(new m.MapScene())); }
  }

  updatePreview() {
    const s = SLOTS[this.cursor];
    const it = this.candidates(s)[this.pick];
    const lo = this.withItem(s, it ? it.id : null);
    const build = computeBuild(stashMap(), lo);
    this.preview = { build, ship: buildPlayerShip(build.look) };
    if (it) newLoot.delete(it.id);
  }

  updatePick() {
    const s = SLOTS[this.cursor];
    const list = this.candidates(s);
    const n = list.length;
    const old = this.pick;
    if (repeat("down")) this.pick = (this.pick + 1) % n;
    if (repeat("up")) this.pick = (this.pick + n - 1) % n;
    if (repeat("right")) this.pick = Math.min(n - 1, this.pick + VISIBLE);
    if (repeat("left")) this.pick = Math.max(0, this.pick - VISIBLE);
    if (mouse.wheel) this.scroll = Math.max(0, Math.min(Math.max(0, n - VISIBLE), this.scroll + mouse.wheel * 2));
    let clicked = false;
    if (mouse.moved || mouse.clicked) {
      if (mouse.x >= 4 && mouse.x <= 142 && mouse.y >= LIST_Y && mouse.y < LIST_Y + VISIBLE * 13) {
        const i = this.scroll + Math.floor((mouse.y - LIST_Y) / 13);
        if (i < n) { this.pick = i; clicked = mouse.clicked; }
      } else if (mouse.clicked && mouse.y > LIST_Y - 10) { this.mode = "slots"; this.preview = null; sfx("select"); return; }
    }
    if (this.pick !== old) { sfx("move"); this.updatePreview(); }
    if (this.pick < this.scroll) this.scroll = this.pick;
    if (this.pick >= this.scroll + VISIBLE) this.scroll = this.pick - VISIBLE + 1;
    const item = list[this.pick];
    if (pressed("ok") || clicked) {
      profile.loadout = this.withItem(s, item ? item.id : null);
      save();
      this.refresh();
      sfx("equip");
      this.mode = "slots";
      this.preview = null;
      if (this.build.complete && !this.build.valid) this.flash("OVER ENERGY BUDGET");
      return;
    }
    if (pressed("alt") && item) {
      if (this.isEquipped(item.id)) { sfx("deny"); this.flash("CAN'T SCRAP EQUIPPED GEAR"); }
      else {
        profile.stash = profile.stash.filter((i) => i.id !== item.id);
        save();
        sfx("scrap");
        this.flash("SCRAPPED");
        this.pick = Math.min(this.pick, list.length - 2);
        this.updatePreview();
      }
    }
    if (pressed("back")) { this.mode = "slots"; this.preview = null; sfx("select"); }
  }

  // ------------------------------------------------------------ drawing

  draw() {
    ctx.drawImage(blueprint(), 0, 0);
    text("HANGAR // SCHEMATIC", 4, 3, { color: "#9fd8ff" });
    text(`STASH ${profile.stash.length}`, W - 4, 3, { align: "right", color: "#6f9fd0" });
    const view = this.preview ?? { ship: this.ship, build: this.build };
    this.drawShip(view.ship, view.build);
    for (let i = 0; i < SLOTS.length; i++) this.drawCallout(SLOTS[i], i, view.ship, view.build);
    this.drawStats(view.build);
    if (this.mode === "slots") this.drawDetail();
    else this.drawPicker();
    if (this.msgT > 0) {
      panel(30, 140, W - 60, 22, "#f66");
      text(this.msg, W / 2, 148, { align: "center", color: "#ffb0b0" });
    }
  }

  drawShip(s: PlayerShipSprite, b: Build) {
    // Blueprint reticle behind the ship.
    ctx.strokeStyle = "#1f4a8a";
    ctx.beginPath(); ctx.arc(SHIP_X, SHIP_Y + 6, 50, 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath(); ctx.arc(SHIP_X, SHIP_Y + 6, 36, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = "#1f4a8a";
    ctx.fillRect(SHIP_X - 60, SHIP_Y + 6, 120, 1);
    ctx.fillRect(SHIP_X, SHIP_Y - 54, 1, 120);
    for (const n of s.nozzles) {
      const len = 6 + ((this.t >> 2) % 3) * 2;
      ctx.fillStyle = "#3a8cff";
      ctx.fillRect(Math.round(SHIP_X + n.x * 2 - 3), Math.round(SHIP_Y + n.y * 2 + 8), 6, len);
      ctx.fillStyle = "#e8f8ff";
      ctx.fillRect(Math.round(SHIP_X + n.x * 2 - 1), Math.round(SHIP_Y + n.y * 2 + 8), 2, len - 2);
    }
    ctx.drawImage(s.c, Math.round(SHIP_X - s.ax * 2), Math.round(SHIP_Y - s.ay * 2), s.w * 2, s.h * 2);
    const r = b.hitbox;
    ctx.fillStyle = "#fff";
    ctx.fillRect(Math.round(SHIP_X - r), Math.round(SHIP_Y - r), Math.round(r * 2), Math.round(r * 2));
  }

  /** Where on the ship a slot's leader line lands (screen coordinates). */
  anchor(sd: SlotDef, s: PlayerShipSprite): [number, number] {
    const at = (m: MountPoint) => [SHIP_X + m.x * 2, SHIP_Y + m.y * 2] as [number, number];
    const right = (pts: MountPoint[]) => pts[pts.length - 1];
    switch (sd.key) {
      case "hull": return [SHIP_X - 6, SHIP_Y - 10];
      case "wings": return at(s.mains[2][0]);
      case "engine": return at({ x: s.nozzles[0].x, y: s.nozzles[0].y + 2 });
      case "bomb": return at(s.ords[1][0]);
      case "main": return at(right(s.mains[sd.index]));
      case "ord": return at(right(s.ords[sd.index]));
    }
  }

  drawCallout(sd: SlotDef, i: number, s: PlayerShipSprite, b: Build) {
    const bx = sd.side === "L" ? 4 : W - 4 - BOX_W;
    const on = this.enabled(sd, b);
    const sel = i === this.cursor;
    const lo = this.preview && sel ? this.withItem(sd, this.candidates(sd)[this.pick]?.id ?? null) : profile.loadout;
    const id = this.equipped(sd, lo);
    const it = id != null ? stashMap().get(id) ?? null : null;
    // Leader line: out from the box, then an elbow to the hardpoint.
    const [ax, ay] = this.anchor(sd, s);
    const sx = sd.side === "L" ? bx + BOX_W : bx;
    const sy = sd.y + BOX_H / 2;
    const ex = sd.side === "L" ? Math.min(ax - 6, sx + 14) : Math.max(ax + 6, sx - 14);
    const col = !on ? "#28406a" : sel ? "#ffe040" : it ? "#5fd0ff" : "#3a78b0";
    ctx.strokeStyle = col;
    ctx.setLineDash(on ? [] : [2, 2]);
    ctx.beginPath();
    ctx.moveTo(sx + 0.5, sy + 0.5);
    ctx.lineTo(ex + 0.5, sy + 0.5);
    ctx.lineTo(ax + 0.5, ay + 0.5);
    ctx.stroke();
    ctx.setLineDash([]);
    if (on) { ctx.fillStyle = col; ctx.fillRect(Math.round(ax) - 1, Math.round(ay) - 1, 3, 3); }
    // Box.
    ctx.fillStyle = sel ? "rgba(60,50,10,0.92)" : "rgba(6,16,40,0.92)";
    ctx.fillRect(bx, sd.y, BOX_W, BOX_H);
    ctx.strokeStyle = !on ? "#203458" : sel ? "#ffe040" : it ? RARITY_COLOR[it.rarity] : "#2f5a90";
    ctx.strokeRect(bx + 0.5, sd.y + 0.5, BOX_W - 1, BOX_H - 1);
    text(sd.label, bx + 21, sd.y + 3, { color: on ? "#7fb0e0" : "#2f4a70", shadow: null });
    if (!on) { text("N/A", bx + 21, sd.y + 12, { color: "#2f4a70", shadow: null }); return; }
    drawIcon(it, bx + 3, sd.y + 3, 16);
    const name = it ? roll(it).name.toUpperCase() : "EMPTY";
    text(name.length > 9 ? name.slice(0, 8) + "." : name, bx + 21, sd.y + 12, { color: it ? RARITY_COLOR[it.rarity] : "#4a6a90", shadow: null });
    if (it && newLoot.has(it.id)) text("*", bx + BOX_W - 6, sd.y + 3, { color: "#ffe040", shadow: null });
  }

  drawStats(b: Build) {
    const y = 166;
    const base = this.preview ? this.build : null;
    const dps = (x: Build) => x.weapons.reduce((s, w) => s + w.damage * w.rate * w.amount, 0);
    const cells: [string, string, number | null][] = [
      ["HITS", String(b.hp), base ? b.hp - base.hp : null],
      ["SHLD", String(b.shields), base ? b.shields - base.shields : null],
      ["SPD", b.lat.toFixed(1), base ? b.lat - base.lat : null],
      ["DPS", String(Math.round(dps(b))), base ? dps(b) - dps(base) : null],
    ];
    cells.forEach(([k, v, d], i) => {
      const x = 4 + i * 56;
      text(k, x, y, { color: "#6f9fd0", shadow: null });
      text(v, x + 28, y, { color: d == null || Math.abs(d) < 0.05 ? "#fff" : d > 0 ? "#70ff90" : "#ff7070" });
    });
    // Energy budget bar.
    const over = b.energyUsed > b.energyCap;
    text(`${b.energyUsed}/${b.energyCap}`, W - 4, y, { align: "right", color: over ? "#ff5050" : "#80ff80" });
    const bx = 4, bw = W - 8, by = y + 10;
    ctx.fillStyle = "#000"; ctx.fillRect(bx, by, bw, 5);
    const cap = Math.max(1, b.energyCap, b.energyUsed);
    for (let i = 0; i < cap; i++) {
      const sx = bx + 1 + Math.floor((i * (bw - 2)) / cap);
      const ex = bx + 1 + Math.floor(((i + 1) * (bw - 2)) / cap) - 1;
      ctx.fillStyle = i >= b.energyCap ? "#ff3030" : i < b.energyUsed ? "#50e060" : "#13301c";
      ctx.fillRect(sx, by + 1, Math.max(1, ex - sx), 3);
    }
  }

  /** Large detail panel for the selected slot's item. */
  drawDetail() {
    const sd = SLOTS[this.cursor];
    const id = this.equipped(sd);
    const it = id != null ? stashMap().get(id) ?? null : null;
    const x = 4, y = LIST_Y - 6, w = W - 8, h = H - y - 16;
    panel(x, y, w, h, it ? RARITY_COLOR[it.rarity] : "#2f5a90");
    if (!this.enabled(sd)) {
      text(`${sd.label}: NOT AVAILABLE`, x + 8, y + 8, { color: "#6f9fd0" });
      for (const [k, l] of wrap("THE EQUIPPED WINGS DON'T HAVE THIS HARDPOINT. FIT WINGS WITH MORE MAIN OR ORDNANCE SLOTS.", 44).entries()) text(l, x + 8, y + 22 + k * 10, { color: "#8090b0" });
    } else if (!it) {
      text(`${sd.label}: EMPTY`, x + 8, y + 8, { color: "#6f9fd0" });
      text("PRESS Z TO FIT A PART FROM THE STASH", x + 8, y + 22, { color: "#8090b0" });
    } else this.itemDetail(it, x + 6, y + 6, w - 12, sd.label);
    text("ARROWS SELECT   Z CHANGE   X MAP", W / 2, H - 11, { align: "center", color: "#5a7aa0" });
  }

  itemDetail(it: Item, x: number, y: number, w: number, label: string) {
    const r = roll(it);
    const cols = Math.floor(w / 6) - 4;
    ctx.fillStyle = "#000";
    ctx.fillRect(x, y, 30, 30);
    ctx.drawImage(img[`icons_${r.def.icon}`], x + 1, y + 1, 28, 28);
    ctx.strokeStyle = RARITY_COLOR[it.rarity];
    ctx.strokeRect(x + 0.5, y + 0.5, 29, 29);
    text(label, x + 36, y, { color: "#6f9fd0" });
    text(r.name.toUpperCase().slice(0, cols - 5), x + 36, y + 10, { color: RARITY_COLOR[it.rarity] });
    text(`${RARITY_NAME[it.rarity].toUpperCase()} ${r.def.name.toUpperCase()}  ILVL ${it.ilvl}`.slice(0, cols - 5), x + 36, y + 20, { color: "#8090b0" });
    let ly = y + 38;
    for (const l of baseLines(it)) { text(l, x, ly, { color: "#d0dcf0" }); ly += 10; }
    if (r.lines.length || r.effect) { ctx.fillStyle = "#2f5a90"; ctx.fillRect(x, ly + 1, w, 1); ly += 6; }
    for (const l of r.lines) for (const s of wrap(l, cols + 4)) { text(s, x, ly, { color: "#8fb0ff" }); ly += 10; }
    if (r.effect) for (const s of wrap(r.effect, cols + 4)) { text(s, x, ly, { color: "#ffa040" }); ly += 10; }
  }

  drawPicker() {
    const sd = SLOTS[this.cursor];
    const list = this.candidates(sd);
    panel(2, LIST_Y - 14, 144, VISIBLE * 13 + 18, "#ffe040");
    text(`${sd.label}: ${list.filter(Boolean).length} PARTS`, 6, LIST_Y - 10, { color: "#ffe040" });
    for (let k = 0; k < VISIBLE; k++) {
      const i = this.scroll + k;
      if (i >= list.length) break;
      const it = list[i];
      const y = LIST_Y + k * 13;
      if (i === this.pick) { ctx.fillStyle = "rgba(255,224,64,0.18)"; ctx.fillRect(4, y - 1, 140, 13); }
      if (!it) { text("- REMOVE -", 20, y + 2, { color: "#8090b0" }); continue; }
      drawIcon(it, 6, y, 11);
      text(roll(it).name.toUpperCase().slice(0, 17), 20, y + 2, { color: RARITY_COLOR[it.rarity] });
      if (this.isEquipped(it.id)) text("E", 142, y + 2, { align: "right", color: "#80ff80" });
      else if (newLoot.has(it.id)) text("*", 142, y + 2, { align: "right", color: "#ffe040" });
    }
    if (list.length > VISIBLE) {
      const h = VISIBLE * 13;
      ctx.fillStyle = "#334";
      ctx.fillRect(144, LIST_Y, 2, h);
      ctx.fillStyle = "#ffe040";
      ctx.fillRect(144, LIST_Y + Math.floor((this.scroll / list.length) * h), 2, Math.max(4, Math.floor((VISIBLE / list.length) * h)));
    }
    const it = list[this.pick];
    const x = 150, y = LIST_Y - 14, w = W - 152, h = H - y - 16;
    panel(x, y, w, h, it ? RARITY_COLOR[it.rarity] : "#2f5a90");
    if (it) {
      const r = roll(it);
      const cols = Math.floor((w - 8) / 6);
      let ly = y + 5;
      const put = (s: string, c: string) => { for (const l of wrap(s, cols)) { if (ly < y + h - 10) text(l, x + 4, ly, { color: c }); ly += 9; } };
      put(r.name.toUpperCase(), RARITY_COLOR[it.rarity]);
      put(`${RARITY_NAME[it.rarity].toUpperCase()} ILVL ${it.ilvl}`, "#8090b0");
      for (const l of baseLines(it)) put(l, "#d0dcf0");
      for (const l of r.lines) put(l, "#8fb0ff");
      if (r.effect) put(r.effect, "#ffa040");
      if (this.preview && this.preview.build.energyUsed > this.preview.build.energyCap) put("OVER ENERGY BUDGET", "#ff5050");
    } else text("EMPTIES THE SLOT", x + 4, y + 5, { color: "#8090b0" });
    text("Z FIT  X BACK  R SCRAP", W / 2, H - 11, { align: "center", color: "#5a7aa0" });
  }
}
