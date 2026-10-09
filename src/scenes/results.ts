/** After a sortie: score, chain, and the loot that goes to the hangar. */
import { ctx, W, H } from "../gfx/screen";
import { text } from "../gfx/font";
import { pressed, mouse } from "../core/input";
import { sfx, playSong, voice, ambience } from "../core/audio";
import { profile, save } from "../game/save";
import { RARITY_COLOR, roll } from "../game/items";
import type { World } from "../game/world";
import { setScene, type Scene } from "./scene";
import { drawIcon, panel, tierName } from "./common";
import { HangarScene, newLoot } from "./hangar";

export class ResultsScene implements Scene {
  t = 0;
  clear: boolean;
  unlockedNew = false;
  best = false;

  constructor(private w: World) {
    this.clear = w.done === "clear";
    profile.stash.push(...w.loot);
    w.loot.forEach((i) => newLoot.add(i.id));
    const key = String(w.tier);
    if (w.score > (profile.best[key] ?? 0)) { profile.best[key] = w.score; this.best = true; }
    if (this.clear && profile.unlocked <= w.tier) {
      profile.unlocked = w.tier + 1;
      this.unlockedNew = true;
    }
    save();
  }

  enter() {
    playSong("hangar");
    ambience(null);
    if (!this.clear) sfx("jingle_fail");
    if (this.best && this.w.score > 0) setTimeout(() => voice("v_highscore", 2), 900);
  }

  update() {
    this.t++;
    if (this.t > 40 && (pressed("ok") || pressed("back") || mouse.clicked)) {
      sfx("select");
      setScene(new HangarScene());
    }
  }

  draw() {
    const w = this.w;
    ctx.fillStyle = "#06081a";
    ctx.fillRect(0, 0, W, H);
    const title = this.clear ? "MISSION COMPLETE" : w.retreated ? "SORTIE ABORTED" : "SHOT DOWN";
    text(title, W / 2, 16, { align: "center", scale: 2, color: this.clear ? "#ffe040" : "#ff6060" });
    text(`${tierName(w.tier)} - COASTAL LAUNCH`, W / 2, 38, { align: "center", color: "#a0c0ff" });
    const rows: [string, string][] = [
      ["SCORE", String(w.score)],
      ["MAX CHAIN", String(w.maxChain)],
      ["KILLS", String(w.kills)],
      ["HITS TAKEN", String(w.hits)],
    ];
    rows.forEach(([k, v], i) => {
      if (this.t < 10 + i * 8) return;
      text(k, 60, 58 + i * 11, { color: "#ccc" });
      text(v, W - 60, 58 + i * 11, { align: "right" });
    });
    if (this.best && this.t > 50) text("NEW BEST!", W / 2, 104, { align: "center", color: "#ffe040" });
    if (this.unlockedNew && this.t > 60) text(`${tierName(w.tier + 1)} UNLOCKED`, W / 2, 116, { align: "center", color: "#ff5050" });

    panel(12, 130, W - 24, H - 160);
    text(`LOOT RECOVERED: ${w.loot.length}`, 20, 136, { color: "#fff" });
    const shown = w.loot.slice().sort((a, b) => b.rarity - a.rarity).slice(0, 17);
    shown.forEach((it, i) => {
      if (this.t < 70 + i * 4) return;
      const y = 150 + i * 11;
      drawIcon(it, 20, y - 1, 10);
      text(roll(it).name.toUpperCase().slice(0, 34), 34, y, { color: RARITY_COLOR[it.rarity] });
      text(`L${it.ilvl}`, W - 22, y, { align: "right", color: "#778" });
    });
    if (w.loot.length > shown.length) text(`+${w.loot.length - shown.length} MORE`, W / 2, H - 42, { align: "center", color: "#888" });
    if (w.loot.length === 0 && this.t > 70) text("NOTHING RECOVERED", W / 2, 180, { align: "center", color: "#666" });
    if (this.t > 40 && Math.floor(this.t / 30) % 2 === 0) text("PRESS Z TO RETURN TO HANGAR", W / 2, H - 20, { align: "center", color: "#ffe040" });
  }
}
