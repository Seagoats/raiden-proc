/** The hangar: fit hull, wings, engines, weapons and bomb from the stash under the energy budget. */
import { ctx, W, H } from "../gfx/screen";
import { text } from "../gfx/font";
import { img } from "../gfx/assets";
import { mouse, pressed, repeat } from "../core/input";
import { sfx, playSong, voice, ambience } from "../core/audio";
import { buildPlayerShip, type PlayerShipSprite } from "../gfx/sprites";
import { profile, save, stashMap } from "../game/save";
import { BASES, RARITY_COLOR, roll, type Item, type Slot } from "../game/items";
import { computeBuild, type Build } from "../game/stats";
import { setScene, type Scene } from "./scene";
import { StageScene } from "./stage";
import { TitleScene } from "./title";
import { drawIcon, itemCard, panel, tierName } from "./common";

/** Items picked up in the last sortie, flagged NEW until viewed. */
export const newLoot = new Set<number>();
let welcomed = false;

interface SlotRow { label: string; slot: Slot; key: "hull" | "wings" | "engine" | "bomb" | "main" | "ord"; index: number }
const SLOTS: SlotRow[] = [
  { label: "HULL", slot: "hull", key: "hull", index: 0 },
  { label: "WINGS", slot: "wings", key: "wings", index: 0 },
  { label: "ENGINE", slot: "engine", key: "engine", index: 0 },
  { label: "MAIN 1", slot: "main", key: "main", index: 0 },
  { label: "MAIN 2", slot: "main", key: "main", index: 1 },
  { label: "MAIN 3", slot: "main", key: "main", index: 2 },
  { label: "ORD 1", slot: "ord", key: "ord", index: 0 },
  { label: "ORD 2", slot: "ord", key: "ord", index: 1 },
  { label: "ORD 3", slot: "ord", key: "ord", index: 2 },
  { label: "BOMB", slot: "bomb", key: "bomb", index: 0 },
];
const ROW_SORTIE = SLOTS.length;
const ROW_TIER = SLOTS.length + 1;
const LIST_Y = 140;
const ROW_H = 13;
const VISIBLE = 12;

export class HangarScene implements Scene {
  cursor = ROW_SORTIE;
  mode: "slots" | "stash" = "slots";
  stashCursor = 0;
  stashScroll = 0;
  build!: Build;
  ship!: PlayerShipSprite;
  shipKey = "";
  t = 0;
  msg = "";
  msgT = 0;

  enter() {
    playSong("hangar");
    ambience("amb_hangar", 0.5);
    if (!welcomed) { welcomed = true; setTimeout(() => voice("v_welcome"), 400); }
    this.refresh();
  }

  refresh() {
    this.build = computeBuild(stashMap(), profile.loadout);
    const key = JSON.stringify(this.build.look);
    if (key !== this.shipKey) {
      this.ship = buildPlayerShip(this.build.look);
      this.shipKey = key;
    }
  }

  equipped(r: SlotRow): number | null {
    const lo = profile.loadout;
    return r.key === "main" || r.key === "ord" ? lo[r.key][r.index] : lo[r.key];
  }
  setEquipped(r: SlotRow, id: number | null) {
    const lo = profile.loadout;
    if (r.key === "main" || r.key === "ord") {
      // An item can only sit in one hardpoint.
      for (const k of ["main", "ord"] as const) lo[k] = lo[k].map((x) => (x === id ? null : x));
      lo[r.key][r.index] = id;
    } else lo[r.key] = id;
    save();
    this.refresh();
  }
  slotEnabled(r: SlotRow) {
    if (r.key === "main") return r.index < this.build.mainSlots;
    if (r.key === "ord") return r.index < this.build.ordSlots;
    return true;
  }
  isEquipped(id: number) {
    const lo = profile.loadout;
    return lo.hull === id || lo.wings === id || lo.engine === id || lo.bomb === id || lo.main.includes(id) || lo.ord.includes(id);
  }

  stashList(): (Item | null)[] {
    const r = SLOTS[this.cursor];
    const items = profile.stash
      .filter((i) => BASES[i.base].slot === r.slot)
      .sort((a, b) => Number(newLoot.has(b.id)) - Number(newLoot.has(a.id)) || b.rarity - a.rarity || b.ilvl - a.ilvl || a.base.localeCompare(b.base));
    return r.key === "main" || r.key === "ord" || r.key === "bomb" ? [null, ...items] : items;
  }

  flash(m: string) {
    this.msg = m;
    this.msgT = 120;
  }

  // ------------------------------------------------------------ input

  update() {
    this.t++;
    if (this.msgT > 0) this.msgT--;
    if (this.mode === "slots") this.updateSlots();
    else this.updateStash();
  }

  updateSlots() {
    const rows = ROW_TIER + 1;
    if (repeat("up")) { this.cursor = (this.cursor + rows - 1) % rows; sfx("move"); }
    if (repeat("down")) { this.cursor = (this.cursor + 1) % rows; sfx("move"); }
    // Mouse hover / click.
    let clicked = false;
    if (mouse.moved || mouse.clicked) {
      const hit = this.rowAt(mouse.x, mouse.y);
      if (hit !== null) {
        if (hit !== this.cursor && mouse.moved) sfx("move");
        this.cursor = hit;
        clicked = mouse.clicked;
      }
      if (mouse.clicked && this.cursor === ROW_TIER && hit === ROW_TIER) {
        this.changeTier(mouse.x > 200 ? 1 : mouse.x < 120 ? -1 : 0);
        clicked = false;
      }
    }
    if (this.cursor === ROW_TIER) {
      if (repeat("left")) this.changeTier(-1);
      if (repeat("right")) this.changeTier(1);
    }
    if (pressed("ok") || clicked) {
      if (this.cursor === ROW_SORTIE) return this.sortie();
      if (this.cursor < SLOTS.length) {
        if (!this.slotEnabled(SLOTS[this.cursor])) { sfx("deny"); this.flash("THESE WINGS HAVE NO SUCH HARDPOINT"); return; }
        this.mode = "stash";
        const list = this.stashList();
        const eq = this.equipped(SLOTS[this.cursor]);
        this.stashCursor = Math.max(0, list.findIndex((i) => (i ? i.id : null) === eq));
        this.stashScroll = Math.max(0, this.stashCursor - VISIBLE + 3);
        sfx("select");
      }
    }
    if (pressed("back")) { sfx("select"); setScene(new TitleScene()); }
  }

  changeTier(d: number) {
    const t = Math.max(0, Math.min(profile.unlocked, profile.tier + d));
    if (t === profile.tier) { if (d) sfx("deny"); return; }
    profile.tier = t;
    save();
    sfx("move");
  }

  rowAt(x: number, y: number): number | null {
    if (x < 4 || x > 144) {
      if (y >= 312 && y < 330 && x >= 148) return ROW_TIER;
      return null;
    }
    const i = Math.floor((y - LIST_Y) / ROW_H);
    if (i >= 0 && i < SLOTS.length) return i;
    if (y >= 312 && y < 330) return ROW_SORTIE;
    return null;
  }

  sortie() {
    if (!this.build.complete) { sfx("deny"); this.flash("FIT A HULL, WINGS AND ENGINE"); return; }
    if (!this.build.valid) { sfx("deny"); voice("v_negative"); this.flash("OVER ENERGY BUDGET"); return; }
    if (this.build.weapons.length === 0) { sfx("deny"); this.flash("MOUNT AT LEAST ONE WEAPON"); return; }
    sfx("confirm");
    voice("v_yougotit", 2);
    newLoot.clear();
    setScene(new StageScene());
  }

  updateStash() {
    const list = this.stashList();
    const n = list.length;
    if (repeat("up")) { this.stashCursor = (this.stashCursor + n - 1) % n; sfx("move"); }
    if (repeat("down")) { this.stashCursor = (this.stashCursor + 1) % n; sfx("move"); }
    if (repeat("left")) { this.stashCursor = Math.max(0, this.stashCursor - VISIBLE); sfx("move"); }
    if (repeat("right")) { this.stashCursor = Math.min(n - 1, this.stashCursor + VISIBLE); sfx("move"); }
    if (mouse.wheel) this.stashScroll = Math.max(0, Math.min(Math.max(0, n - VISIBLE), this.stashScroll + mouse.wheel * 2));
    let clicked = false;
    if (mouse.moved || mouse.clicked) {
      if (mouse.x >= 4 && mouse.x <= 144 && mouse.y >= LIST_Y && mouse.y < LIST_Y + VISIBLE * ROW_H) {
        const i = this.stashScroll + Math.floor((mouse.y - LIST_Y) / ROW_H);
        if (i < n) { this.stashCursor = i; clicked = mouse.clicked; }
      } else if (mouse.clicked) { this.mode = "slots"; sfx("select"); return; }
    }
    if (this.stashCursor < this.stashScroll) this.stashScroll = this.stashCursor;
    if (this.stashCursor >= this.stashScroll + VISIBLE) this.stashScroll = this.stashCursor - VISIBLE + 1;
    const item = list[this.stashCursor];
    if (item) newLoot.delete(item.id);
    if (pressed("ok") || clicked) {
      this.setEquipped(SLOTS[this.cursor], item ? item.id : null);
      sfx("equip");
      this.mode = "slots";
      if (!this.build.valid && this.build.complete) this.flash("OVER ENERGY BUDGET");
    }
    if (pressed("alt") && item) {
      if (this.isEquipped(item.id)) { sfx("deny"); this.flash("CAN'T SCRAP EQUIPPED GEAR"); }
      else {
        profile.stash = profile.stash.filter((i) => i.id !== item.id);
        save();
        sfx("scrap");
        this.flash("SCRAPPED");
        this.stashCursor = Math.min(this.stashCursor, list.length - 2);
      }
    }
    if (pressed("back")) { this.mode = "slots"; sfx("select"); }
  }

  // ------------------------------------------------------------ drawing

  draw() {
    ctx.drawImage(img.hangar_bg, 0, 0);
    ctx.fillStyle = "rgba(0,0,10,0.35)";
    ctx.fillRect(0, 0, W, H);
    text("HANGAR", 6, 4, { color: "#ffe040" });
    text(`STASH ${profile.stash.length}`, W - 6, 4, { align: "right", color: "#99a" });
    this.drawShip();
    this.drawStats();
    if (this.mode === "slots") this.drawSlots();
    else this.drawStash();
    this.drawBottom();
    if (this.msgT > 0) {
      panel(30, H / 2 - 12, W - 60, 22, "#f66");
      text(this.msg, W / 2, H / 2 - 4, { align: "center", color: "#ffb0b0" });
    }
  }

  drawShip() {
    const s = this.ship;
    const cx = 74, cy = 74;
    // Platform.
    ctx.fillStyle = "rgba(255,200,40,0.08)";
    ctx.beginPath();
    ctx.ellipse(cx, cy + 6, 62, 50, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 0.35;
    ctx.drawImage(s.shadow, Math.round(cx - s.ax * 2 + 8), Math.round(cy - s.ay * 2 + 12), s.w * 2, s.h * 2);
    ctx.globalAlpha = 1;
    // Exhaust.
    for (const n of s.nozzles) {
      const len = 6 + (this.t >> 2) % 3 * 2;
      ctx.fillStyle = "#3a8cff";
      ctx.fillRect(Math.round(cx + n.x * 2 - 3), Math.round(cy + n.y * 2 + 8), 6, len);
      ctx.fillStyle = "#e8f8ff";
      ctx.fillRect(Math.round(cx + n.x * 2 - 1), Math.round(cy + n.y * 2 + 8), 2, len - 2);
    }
    ctx.drawImage(s.c, Math.round(cx - s.ax * 2), Math.round(cy - s.ay * 2), s.w * 2, s.h * 2);
    ctx.fillStyle = "#fff";
    const r = this.build.hitbox;
    ctx.fillRect(Math.round(cx - r), Math.round(cy - r), Math.round(r * 2), Math.round(r * 2));
  }

  drawStats() {
    const b = this.build;
    const x = 150, y = 16;
    panel(x - 4, y - 2, W - x, 118);
    const dps = b.weapons.reduce((s, w) => s + w.damage * w.rate * w.amount, 0);
    const lines: [string, string, string?][] = [
      ["HITS", String(b.hp), "#ff8080"],
      ["SHIELDS", `${b.shields} / ${Math.round(b.recharge)} SEC`, "#60f0ff"],
      ["SPEED", `${b.lat.toFixed(1)} / ${b.vert.toFixed(1)}`],
      ["PRECISION", b.precision.toFixed(2)],
      ["DPS", `${Math.round(dps)}`, "#ffe040"],
      ["BOMBS", b.bomb ? `${b.bomb.stock} ${b.bomb.type.toUpperCase()}` : "NONE"],
      ["MAGIC FIND", `+${b.mf}%`],
    ];
    lines.forEach(([k, v, c], i) => {
      text(k, x, y + 2 + i * 10, { color: "#99a" });
      text(v, W - 8, y + 2 + i * 10, { align: "right", color: c ?? "#fff" });
    });
    // Energy bar.
    const ey = y + 76;
    text("ENERGY", x, ey, { color: "#99a" });
    const over = b.energyUsed > b.energyCap;
    text(`${b.energyUsed}/${b.energyCap}`, W - 8, ey, { align: "right", color: over ? "#ff5050" : "#80ff80" });
    const bw = W - x - 10;
    ctx.fillStyle = "#000"; ctx.fillRect(x, ey + 10, bw, 7);
    const cap = Math.max(1, Math.max(b.energyCap, b.energyUsed));
    for (let i = 0; i < cap; i++) {
      const sx = x + 1 + Math.floor((i * (bw - 2)) / cap);
      const ex = x + 1 + Math.floor(((i + 1) * (bw - 2)) / cap) - 1;
      ctx.fillStyle = i >= b.energyCap ? "#ff3030" : i < b.energyUsed ? "#50e060" : "#1a3020";
      ctx.fillRect(sx, ey + 11, Math.max(1, ex - sx), 5);
    }
    text(over ? "OVER BUDGET!" : `${b.energyCap - b.energyUsed} ENERGY SPARE`, x, ey + 22, { color: over ? "#ff5050" : "#556" });
  }

  drawSlots() {
    panel(2, LIST_Y - 4, 146, SLOTS.length * ROW_H + 6);
    const map = stashMap();
    SLOTS.forEach((r, i) => {
      const y = LIST_Y + i * ROW_H;
      const enabled = this.slotEnabled(r);
      const id = this.equipped(r);
      const it = id != null ? map.get(id) ?? null : null;
      if (i === this.cursor) { ctx.fillStyle = "rgba(255,224,64,0.18)"; ctx.fillRect(4, y - 1, 142, ROW_H); }
      text(r.label, 6, y + 2, { color: enabled ? "#99a" : "#445" });
      if (!enabled) { text("--", 52, y + 2, { color: "#445" }); return; }
      drawIcon(it, 44, y, 11);
      text(it ? roll(it).name.toUpperCase().slice(0, 15) : "EMPTY", 58, y + 2, { color: it ? RARITY_COLOR[it.rarity] : "#556" });
    });
    // Card for the hovered slot.
    const r = SLOTS[this.cursor];
    if (r) {
      const id = this.equipped(r);
      const it = id != null ? map.get(id) : null;
      if (it) itemCard(it, 150, LIST_Y - 4, W - 152);
      else if (this.slotEnabled(r)) { panel(150, LIST_Y - 4, W - 152, 30); text("EMPTY SLOT", 156, LIST_Y + 2, { color: "#888" }); text("Z: CHOOSE FROM STASH", 156, LIST_Y + 12, { color: "#666" }); }
    }
  }

  drawStash() {
    const list = this.stashList();
    const r = SLOTS[this.cursor];
    panel(2, LIST_Y - 14, 146, VISIBLE * ROW_H + 16, "#ffe040");
    text(`${r.label}: ${list.filter(Boolean).length} ITEMS`, 6, LIST_Y - 10, { color: "#ffe040" });
    for (let k = 0; k < VISIBLE; k++) {
      const i = this.stashScroll + k;
      if (i >= list.length) break;
      const it = list[i];
      const y = LIST_Y + k * ROW_H;
      if (i === this.stashCursor) { ctx.fillStyle = "rgba(255,224,64,0.18)"; ctx.fillRect(4, y - 1, 142, ROW_H); }
      if (!it) { text("- UNEQUIP -", 20, y + 2, { color: "#889" }); continue; }
      drawIcon(it, 6, y, 11);
      const eq = this.isEquipped(it.id);
      text(roll(it).name.toUpperCase().slice(0, 17), 20, y + 2, { color: RARITY_COLOR[it.rarity] });
      if (eq) text("E", 140, y + 2, { align: "right", color: "#80ff80" });
      else if (newLoot.has(it.id)) text("*", 140, y + 2, { align: "right", color: "#ffe040" });
    }
    if (list.length > VISIBLE) {
      const h = VISIBLE * ROW_H;
      ctx.fillStyle = "#334";
      ctx.fillRect(146, LIST_Y, 2, h);
      ctx.fillStyle = "#ffe040";
      ctx.fillRect(146, LIST_Y + Math.floor((this.stashScroll / list.length) * h), 2, Math.max(4, Math.floor((VISIBLE / list.length) * h)));
    }
    const it = list[this.stashCursor];
    if (it) {
      // Preview the energy budget with this item swapped in.
      const lo = structuredClone(profile.loadout);
      if (r.key === "main" || r.key === "ord") lo[r.key][r.index] = it.id;
      else lo[r.key] = it.id;
      const after = computeBuild(stashMap(), lo);
      const extra = [`${after.energyUsed > after.energyCap ? "!" : ""}ENERGY ${after.energyUsed}/${after.energyCap}`];
      const dpsNow = this.build.weapons.reduce((s, w) => s + w.damage * w.rate * w.amount, 0);
      const dpsAfter = after.weapons.reduce((s, w) => s + w.damage * w.rate * w.amount, 0);
      if (Math.round(dpsAfter) !== Math.round(dpsNow)) extra.push(`${dpsAfter < dpsNow ? "!" : ""}DPS ${Math.round(dpsNow)} -> ${Math.round(dpsAfter)}`);
      itemCard(it, 150, LIST_Y - 14, W - 152, extra);
    }
  }

  drawBottom() {
    const y = 314;
    const sel = this.mode === "slots" && this.cursor === ROW_SORTIE;
    const ok = this.build.valid && this.build.weapons.length > 0;
    panel(4, y - 2, 140, 18, sel ? "#ffe040" : "#5a6a90");
    text("SORTIE", 74, y + 3, { align: "center", scale: 1, color: sel ? (this.t % 20 < 10 ? "#ffe040" : "#fff") : ok ? "#fff" : "#a55" });
    const tsel = this.mode === "slots" && this.cursor === ROW_TIER;
    panel(150, y - 2, W - 154, 18, tsel ? "#ffe040" : "#5a6a90");
    const tn = tierName(profile.tier);
    text(`< ${tn.padStart(6)} >`, 150 + (W - 154) / 2, y + 3, { align: "center", color: profile.tier ? "#ff6060" : "#a0c0ff" });
    const best = profile.best[String(profile.tier)];
    text(`BEST ${best ?? 0}`, 8, y + 20, { color: "#667" });
    if (profile.unlocked > 0) text(`MAX ${tierName(profile.unlocked)}`, W - 8, y + 20, { align: "right", color: "#a55" });
    const help = this.mode === "slots" ? "ARROWS MOVE  Z SELECT  X TITLE" : "Z EQUIP  X BACK  R SCRAP";
    text(help, W / 2, H - 12, { align: "center", color: "#778" });
  }
}
