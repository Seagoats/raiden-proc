/** Title screen over the Codex key art. */
import { ctx, W, H } from "../gfx/screen";
import { text } from "../gfx/font";
import { img } from "../gfx/assets";
import { mouse, pressed, repeat } from "../core/input";
import { sfx, playSong } from "../core/audio";
import { resetProfile } from "../game/save";
import { setScene, type Scene } from "./scene";
import { HangarScene } from "./hangar";

export class TitleScene implements Scene {
  t = 0;
  menu = 0;
  confirm = false;

  enter() {
    playSong("hangar");
  }

  update() {
    this.t++;
    if (repeat("up") || repeat("down")) { this.menu ^= 1; this.confirm = false; sfx("move"); }
    if (mouse.clicked) {
      if (mouse.y > 300 && mouse.y < 316) this.menu = 0;
      else if (mouse.y >= 316 && mouse.y < 332) this.menu = 1;
    }
    if (pressed("ok") || mouse.clicked) {
      if (this.menu === 0) { sfx("confirm"); setScene(new HangarScene()); }
      else if (!this.confirm) { this.confirm = true; sfx("deny"); }
      else { resetProfile(); this.confirm = false; this.menu = 0; sfx("bomb"); }
    }
  }

  draw() {
    ctx.drawImage(img.title_art, 0, 0);
    const g = ctx.createLinearGradient(0, 200, 0, H);
    g.addColorStop(0, "rgba(0,0,20,0)");
    g.addColorStop(1, "rgba(0,0,20,0.85)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 200, W, H - 200);
    const bob = Math.round(Math.sin(this.t * 0.04) * 2);
    text("PROJECT", W / 2, 34 + bob, { align: "center", scale: 2, color: "#ffe8a0", shadow: "#401000" });
    text("RAIDEN", W / 2 + 2, 54 + bob + 2, { align: "center", scale: 5, color: "#401000", shadow: null });
    text("RAIDEN", W / 2, 54 + bob, { align: "center", scale: 5, color: "#ffd040", shadow: "#a02000" });
    text("SHMUP LOOTER  -  PROTOTYPE 0", W / 2, 100, { align: "center", color: "#fff" });
    // Fan-project notice, on a dark band so it reads over the key art.
    ctx.fillStyle = "rgba(0,0,20,0.6)";
    ctx.fillRect(0, 111, W, 22);
    text("UNOFFICIAL FAN PROJECT - INSPIRED BY RAIDEN", W / 2, 113, { align: "center", color: "#ffd890" });
    text("NOT AFFILIATED WITH SEIBU KAIHATSU OR MOSS", W / 2, 123, { align: "center", color: "#b0b8d0" });
    const items = ["START", this.confirm ? "REALLY WIPE THE HANGAR?" : "RESET SAVE"];
    items.forEach((s, i) => {
      const sel = i === this.menu;
      text((sel ? "> " : "  ") + s, W / 2, 304 + i * 16, { align: "center", color: sel ? (this.t % 30 < 15 ? "#ffe040" : "#fff") : "#aab" });
    });
    text("ENEMY SHIPS: GRAFTWING BY TSTONE", W / 2, H - 42, { align: "center", color: "#8899bb" });
    text("ART: CODEX  -  SFX: CHEQUERED INK", W / 2, H - 30, { align: "center", color: "#8899bb" });
    text("ARROWS  Z FIRE  X BOMB  SHIFT SLOW", W / 2, H - 18, { align: "center", color: "#667799" });
  }
}
