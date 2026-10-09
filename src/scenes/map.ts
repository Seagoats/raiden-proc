/** Campaign map: pick a region, then one of its three levels. The hangar lives in the bottom bar. */
import { ctx, W, H } from "../gfx/screen";
import { text, wrap } from "../gfx/font";
import { img } from "../gfx/assets";
import { mouse, pressed, repeat } from "../core/input";
import { sfx, playSong } from "../core/audio";
import { profile, save, stashMap } from "../game/save";
import { computeBuild } from "../game/stats";
import { BIOMES, LEVELS, biomeUnlocked, hellUnlocked, isUnlocked, levelById, type Biome, type Level } from "../game/campaign";
import { setScene, type Scene } from "./scene";
import { StageScene } from "./stage";
import { HangarScene, newLoot } from "./hangar";
import { TitleScene } from "./title";
import { panel, tierName } from "./common";

/** Region markers on the painted map (screen coordinates). */
const NODES: [number, number][] = [[178, 296], [62, 150], [214, 134], [144, 30]];
const BAR_Y = 336;

type Focus = { kind: "region"; i: number } | { kind: "hangar" } | { kind: "tier" };

export class MapScene implements Scene {
  t = 0;
  focus = 0;
  open: Biome | null = null;
  row = 0;
  msg = "";
  msgT = 0;

  enter() {
    playSong("hangar");
    // Start on the region of the last chosen (or newly unlocked) level.
    this.focus = 1 + levelById(profile.level).biome - 1;
  }

  focusList(): Focus[] {
    const list: Focus[] = [{ kind: "hangar" }, ...BIOMES.map((_, i) => ({ kind: "region" as const, i }))];
    if (hellUnlocked(profile.cleared)) list.push({ kind: "tier" });
    return list;
  }

  levelsOf(b: Biome): Level[] {
    return LEVELS.filter((l) => l.biome === b.id);
  }

  flash(m: string) { this.msg = m; this.msgT = 110; }

  update() {
    this.t++;
    if (this.msgT > 0) this.msgT--;
    if (this.open) return this.updatePanel();
    const list = this.focusList();
    const n = list.length;
    if (repeat("up") || repeat("right")) { this.focus = (this.focus + 1) % n; sfx("move"); }
    if (repeat("down") || repeat("left")) { this.focus = (this.focus + n - 1) % n; sfx("move"); }
    let clicked = false;
    if (mouse.moved || mouse.clicked) {
      const hit = this.hitTest(mouse.x, mouse.y);
      if (hit >= 0) {
        if (hit !== this.focus && mouse.moved) sfx("move");
        this.focus = hit;
        clicked = mouse.clicked;
      }
    }
    const f = list[this.focus];
    if (f.kind === "tier") {
      const d = (repeat("left") ? -1 : 0) + (repeat("right") ? 1 : 0);
      if (d) this.changeTier(d);
      if (clicked) this.changeTier(mouse.x > 230 ? 1 : -1);
    }
    if (pressed("ok") || (clicked && f.kind !== "tier")) {
      if (f.kind === "hangar") { sfx("select"); setScene(new HangarScene()); }
      else if (f.kind === "region") {
        const b = BIOMES[f.i];
        if (!biomeUnlocked(b, profile.cleared)) { sfx("deny"); this.flash(b.id === 4 ? "CLEAR THE SKY FORTRESS TO REACH ORBIT" : "CLEAR THE PREVIOUS AREA FIRST"); return; }
        this.open = b;
        const levels = this.levelsOf(b);
        const cur = levels.findIndex((l) => l.id === profile.level);
        // Default to the furthest unlocked level in the region.
        this.row = cur >= 0 ? cur : Math.max(0, levels.filter((l) => isUnlocked(l, profile.cleared)).length - 1);
        sfx("select");
      }
    }
    if (pressed("back")) { sfx("select"); setScene(new TitleScene()); }
  }

  changeTier(d: number) {
    const t = Math.max(0, Math.min(profile.unlocked, profile.tier + d));
    if (t === profile.tier) { sfx("deny"); return; }
    profile.tier = t;
    save();
    sfx("move");
  }

  hitTest(x: number, y: number): number {
    const list = this.focusList();
    return list.findIndex((f) => {
      if (f.kind === "hangar") return x >= 6 && x < 134 && y >= BAR_Y + 6 && y < BAR_Y + 30;
      if (f.kind === "tier") return x >= 150 && x < W - 6 && y >= BAR_Y + 6 && y < BAR_Y + 30;
      const [nx, ny] = NODES[f.i];
      return Math.abs(x - nx) < 40 && y > ny - 14 && y < ny + 26;
    });
  }

  updatePanel() {
    const levels = this.levelsOf(this.open!);
    if (repeat("up")) { this.row = (this.row + 2) % 3; sfx("move"); }
    if (repeat("down")) { this.row = (this.row + 1) % 3; sfx("move"); }
    let clicked = false;
    if (mouse.moved || mouse.clicked) {
      const i = Math.floor((mouse.y - 148) / 46);
      if (mouse.x > 20 && mouse.x < W - 20 && i >= 0 && i < 3) {
        if (i !== this.row && mouse.moved) sfx("move");
        this.row = i;
        clicked = mouse.clicked;
      } else if (mouse.clicked) { this.open = null; sfx("select"); return; }
    }
    if (pressed("back")) { this.open = null; sfx("select"); return; }
    if (pressed("ok") || clicked) {
      const level = levels[this.row];
      if (!isUnlocked(level, profile.cleared)) { sfx("deny"); this.flash("CLEAR THE PREVIOUS LEVEL FIRST"); return; }
      const build = computeBuild(stashMap(), profile.loadout);
      if (!build.valid || build.weapons.length === 0) { sfx("deny"); this.flash("FIX YOUR LOADOUT IN THE HANGAR"); return; }
      profile.level = level.id;
      save();
      sfx("confirm");
      newLoot.clear();
      setScene(new StageScene());
    }
  }

  // ------------------------------------------------------------ drawing

  draw() {
    ctx.drawImage(img.world_map, 0, 0);
    // Darken the map slightly so markers and labels pop.
    ctx.fillStyle = "rgba(0,0,16,0.25)";
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = "rgba(0,0,10,0.7)";
    ctx.fillRect(0, 0, W, 12);
    text("CAMPAIGN", 4, 2, { color: "#ffe040" });
    text(`${profile.cleared.length}/12 CLEARED`, W - 4, 2, { align: "right", color: "#a0b0d0" });
    this.drawPaths();
    const list = this.focusList();
    BIOMES.forEach((b, i) => this.drawNode(b, i, !this.open && list[this.focus]?.kind === "region" && (list[this.focus] as any).i === i));
    this.drawBar(list);
    if (this.open) this.drawPanel();
    if (this.msgT > 0) {
      panel(24, H / 2 - 12, W - 48, 22, "#f66");
      text(this.msg, W / 2, H / 2 - 4, { align: "center", color: "#ffb0b0" });
    }
  }

  drawPaths() {
    for (let i = 0; i < NODES.length - 1; i++) {
      const [x0, y0] = NODES[i], [x1, y1] = NODES[i + 1];
      const lit = biomeUnlocked(BIOMES[i + 1], profile.cleared);
      const steps = Math.floor(Math.hypot(x1 - x0, y1 - y0) / 6);
      for (let k = 1; k < steps; k++) {
        if ((k + Math.floor(this.t / 8)) % 2 && lit) continue;
        const x = x0 + ((x1 - x0) * k) / steps, y = y0 + ((y1 - y0) * k) / steps;
        ctx.fillStyle = lit ? "#ffffff" : "rgba(255,255,255,0.25)";
        ctx.fillRect(Math.round(x), Math.round(y), 2, 2);
      }
    }
  }

  drawNode(b: Biome, i: number, selected: boolean) {
    const [x, y] = NODES[i];
    const unlocked = biomeUnlocked(b, profile.cleared);
    const levels = this.levelsOf(b);
    const done = levels.filter((l) => profile.cleared.includes(l.id)).length;
    const col = !unlocked ? "#707888" : done === 3 ? "#60ff80" : "#ffe040";
    const pulse = selected ? 2 + Math.sin(this.t * 0.2) * 1.5 : 0;
    ctx.fillStyle = "#000";
    ctx.beginPath(); ctx.arc(x, y, 9 + pulse, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = col;
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(x, y, 7 + pulse, 0, Math.PI * 2); ctx.stroke();
    ctx.lineWidth = 1;
    if (!unlocked) {
      // Padlock.
      ctx.fillStyle = "#a0a8b8";
      ctx.fillRect(x - 3, y - 1, 7, 5);
      ctx.strokeStyle = "#a0a8b8";
      ctx.strokeRect(x - 1.5, y - 4.5, 4, 4);
    } else {
      text(String(b.id), x + 1, y - 3, { align: "center", color: col, shadow: null });
    }
    // Label with progress pips.
    const label = b.name;
    const w = label.length * 6 + 8;
    const lx = Math.max(2, Math.min(W - w - 2, x - w / 2));
    panel(lx, y + 11, w, 20, selected ? "#ffe040" : "#3a4a70");
    text(label, lx + w / 2, y + 14, { align: "center", color: unlocked ? "#fff" : "#8890a0" });
    for (let k = 0; k < 3; k++) {
      ctx.fillStyle = profile.cleared.includes(levels[k].id) ? "#60ff80" : isUnlocked(levels[k], profile.cleared) ? "#ffe040" : "#404858";
      ctx.fillRect(Math.round(lx + w / 2 - 10 + k * 8), y + 24, 5, 3);
    }
  }

  drawBar(list: Focus[]) {
    ctx.fillStyle = "rgba(4,6,18,0.92)";
    ctx.fillRect(0, BAR_Y, W, H - BAR_Y);
    ctx.fillStyle = "#3a4a70";
    ctx.fillRect(0, BAR_Y, W, 1);
    const f = this.open ? null : list[this.focus];
    const hsel = f?.kind === "hangar";
    panel(6, BAR_Y + 6, 128, 24, hsel ? "#ffe040" : "#5a6a90");
    text("HANGAR", 16, BAR_Y + 10, { color: hsel ? "#ffe040" : "#fff" });
    text(`STASH ${profile.stash.length}`, 16, BAR_Y + 19, { color: "#8890a0" });
    if (newLoot.size) text(`+${newLoot.size} NEW`, 128, BAR_Y + 19, { align: "right", color: "#ffe040" });
    if (hellUnlocked(profile.cleared)) {
      const tsel = f?.kind === "tier";
      panel(150, BAR_Y + 6, W - 156, 24, tsel ? "#ffe040" : "#5a6a90");
      text("DIFFICULTY", 150 + (W - 156) / 2, BAR_Y + 10, { align: "center", color: "#8890a0" });
      text(`< ${tierName(profile.tier)} >`, 150 + (W - 156) / 2, BAR_Y + 19, { align: "center", color: profile.tier ? "#ff6060" : "#a0c0ff" });
    } else {
      const next = LEVELS.find((l) => !profile.cleared.includes(l.id));
      text("NEXT", 150, BAR_Y + 10, { color: "#8890a0" });
      text(next ? `${next.id} ${next.name}`.slice(0, 22) : "ALL CLEAR", 150, BAR_Y + 19, { color: "#fff" });
    }
    text("ARROWS MOVE  Z SELECT  X TITLE", W / 2, H - 10, { align: "center", color: "#667" });
  }

  drawPanel() {
    const b = this.open!;
    ctx.fillStyle = "rgba(0,0,10,0.55)";
    ctx.fillRect(0, 0, W, H);
    panel(16, 104, W - 32, 196, "#ffe040");
    text(`AREA ${b.id}: ${b.name}`, W / 2, 110, { align: "center", color: "#ffe040" });
    text(b.blurb, W / 2, 120, { align: "center", color: "#a0b0d0" });
    if (profile.tier) text(tierName(profile.tier), W / 2, 132, { align: "center", color: "#ff6060" });
    this.levelsOf(b).forEach((l, i) => {
      const y = 148 + i * 46;
      const unlocked = isUnlocked(l, profile.cleared);
      const cleared = profile.cleared.includes(l.id);
      const sel = i === this.row;
      ctx.fillStyle = sel ? "rgba(255,224,64,0.16)" : "rgba(255,255,255,0.03)";
      ctx.fillRect(22, y, W - 44, 42);
      if (sel) { ctx.strokeStyle = "#ffe040"; ctx.strokeRect(22.5, y + 0.5, W - 45, 41); }
      text(`${l.id}  ${l.name}`, 30, y + 5, { color: unlocked ? "#fff" : "#667" });
      text(cleared ? "CLEARED" : unlocked ? "NEW" : "LOCKED", W - 30, y + 5, { align: "right", color: cleared ? "#60ff80" : unlocked ? "#ffe040" : "#667" });
      for (const [k, line] of wrap(l.desc, 36).slice(0, 1).entries()) text(line, 30, y + 16 + k * 9, { color: unlocked ? "#a0b0d0" : "#556" });
      const best = profile.best[`${l.id}.${profile.tier}`];
      const ilvl = profile.tier ? 12 + 3 * profile.tier : 1 + l.index;
      text(`DROPS ILVL ${ilvl}+`, 30, y + 28, { color: "#778" });
      if (best) text(`BEST ${best}`, W - 30, y + 28, { align: "right", color: "#778" });
    });
    text("Z SORTIE   X BACK", W / 2, 290, { align: "center", color: "#888" });
  }
}
