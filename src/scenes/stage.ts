/** The sortie scene: runs the World and draws it SNES-style with layers and a HUD. */
import { ctx, W, H } from "../gfx/screen";
import { text } from "../gfx/font";
import { img } from "../gfx/assets";
import { BULLET, BULLET_KINDS } from "../gfx/sprites";
import { isHeld, pressed, repeat } from "../core/input";
import { sfx, playSong } from "../core/audio";
import { World, Shot, type Enemy, type Pickup } from "../game/world";
import { drawBackground, setupStage } from "../game/stage1";
import { ENEMY_SHIP_KINDS, enemyShip } from "../game/enemies";
import { profile, save, stashMap, syncOptions } from "../game/save";
import { RARITY_COLOR } from "../game/items";
import { setScene, type Scene } from "./scene";
import { ResultsScene } from "./results";
import { tierName } from "./common";

const AURA: Record<string, string> = { armored: "#b8c0d0", revenge: "#ff4040", splitter: "#50ff60", relentless: "#c060ff", shielder: "#60f0ff", reflector: "#ffffff" };

export class StageScene implements Scene {
  w!: World;
  loading = 2;
  paused = false;
  menu = 0;
  cloudT = 0;

  enter() {
    playSong(null);
  }

  update() {
    if (this.loading > 0) {
      if (--this.loading === 0) {
        // Generate this tier's Graftwing squadron up front.
        for (const k of ENEMY_SHIP_KINDS) enemyShip(k, profile.tier);
        this.w = new World({ tier: profile.tier, stash: stashMap(), loadout: profile.loadout, seed: (Date.now() & 0xffffff) ^ profile.sorties });
        setupStage(this.w);
      }
      return;
    }
    if (this.paused) return this.updatePause();
    if (pressed("pause") && this.w.phase !== "launch") {
      this.paused = true;
      this.menu = 0;
      sfx("select");
      return;
    }
    this.w.update();
    this.spawnClouds();
    if (this.w.done) {
      profile.sorties++;
      save();
      setScene(new ResultsScene(this.w));
    }
  }

  spawnClouds() {
    const w = this.w;
    if (w.scrollSpeed <= 0) return;
    if (--this.cloudT <= 0) {
      this.cloudT = 240 + Math.floor(w.rng() * 300);
      const c = img[`clouds_${Math.floor(w.rng() * 5)}`];
      w.bg.push({ img: c, x: w.rng() * (W + 60) - 30 - c.width / 2, y: -c.height - 10, speed: 2.2, layer: "cloud", alpha: 0.85 });
    }
  }

  updatePause() {
    const items = 5;
    if (repeat("up")) { this.menu = (this.menu + items - 1) % items; sfx("move"); }
    if (repeat("down")) { this.menu = (this.menu + 1) % items; sfx("move"); }
    const o = profile.options;
    const d = (repeat("right") ? 1 : 0) - (repeat("left") ? 1 : 0);
    if (d) {
      if (this.menu === 1) o.shotAlpha = Math.max(0.2, Math.min(1, o.shotAlpha + d * 0.1));
      if (this.menu === 2) o.music = Math.max(0, Math.min(1, o.music + d * 0.1));
      if (this.menu === 3) o.sfx = Math.max(0, Math.min(1, o.sfx + d * 0.1));
      syncOptions();
      save();
      sfx("move");
    }
    if (pressed("ok")) {
      if (this.menu === 0) this.paused = false;
      if (this.menu === 4) { this.w.done = "failed"; this.w.retreated = true; this.paused = false; }
    }
    if (pressed("back")) this.paused = false;
    if (!this.paused) sfx("select");
  }

  // ------------------------------------------------------------ drawing

  draw() {
    if (this.loading > 0 || !this.w) {
      ctx.fillStyle = "#000";
      ctx.fillRect(0, 0, W, H);
      text("PREPARING SORTIE", W / 2, H / 2 - 4, { align: "center" });
      return;
    }
    const w = this.w;
    ctx.save();
    if (w.shake > 0.5) ctx.translate(Math.round((w.rng() - 0.5) * w.shake), Math.round((w.rng() - 0.5) * w.shake));
    drawBackground(ctx, w.scrolled, w.t);
    for (const b of w.bg) if (b.layer === "sea") ctx.drawImage(b.img, Math.round(b.x), Math.round(b.y));
    for (const e of w.enemies) if (!e.air) this.drawEnemy(e);
    for (const b of w.bg) if (b.layer === "cloud") { ctx.globalAlpha = b.alpha ?? 1; ctx.drawImage(b.img, Math.round(b.x), Math.round(b.y)); }
    ctx.globalAlpha = 1;
    this.drawShadows();
    for (const e of w.enemies) if (e.air) this.drawEnemy(e);
    this.drawShots();
    this.drawPlayer();
    for (const p of w.pickups) this.drawPickup(p);
    this.drawFx(false);
    this.drawBullets();
    this.drawFx(true);
    this.drawTelegraphs();
    ctx.restore();
    this.drawHud();
    if (this.paused) this.drawPause();
  }

  drawShadows() {
    const w = this.w;
    ctx.globalAlpha = 0.3;
    for (const e of w.enemies) if (e.air) ctx.drawImage(e.sprite.shadow, Math.round(e.x - e.sprite.w / 2 + 14), Math.round(e.y - e.sprite.h / 2 + 22));
    if (w.alive) {
      const off = 2 + w.lift * 14;
      const sh = w.ship;
      ctx.drawImage(sh.shadow, Math.round(w.px - sh.ax + off), Math.round(w.py - sh.ay + off * 1.4));
    }
    ctx.globalAlpha = 1;
  }

  drawEnemy(e: Enemy) {
    const s = e.sprite;
    const t = this.w.t;
    for (const a of e.affixes) {
      ctx.strokeStyle = AURA[a] ?? "#fff";
      ctx.globalAlpha = 0.5 + Math.sin(t * 0.2 + a.length) * 0.3;
      ctx.beginPath();
      ctx.ellipse(e.x, e.y, s.w / 2 + 3 + e.affixes.indexOf(a) * 3, s.h / 2 + 3 + e.affixes.indexOf(a) * 3, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    const im = e.flash > 0 && e.flash % 2 ? s.white : s.c;
    if (e.def.aims && e.angle !== undefined) {
      ctx.save();
      ctx.translate(Math.round(e.x), Math.round(e.y));
      ctx.rotate(e.angle - Math.PI / 2);
      ctx.drawImage(im, -Math.round(s.w / 2), -Math.round(s.h / 2) + 4);
      ctx.restore();
    } else ctx.drawImage(im, Math.round(e.x - s.w / 2), Math.round(e.y - s.h / 2));
    if (e.shield > 0) {
      ctx.strokeStyle = "#7ff";
      ctx.globalAlpha = 0.7;
      ctx.beginPath();
      ctx.arc(e.x, e.y, Math.max(s.w, s.h) / 2 + 2, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
  }

  drawShots() {
    const w = this.w, S = w.shots;
    ctx.globalAlpha = profile.options.shotAlpha;
    for (const p of w.plasma) {
      const wob = Math.sin(w.t * 0.5 + p.x0) * 4;
      const cy = p.y0 - Math.min(90, Math.abs(p.y0 - p.y1) * 0.6);
      for (const [width, col] of [[p.w * 2 + 2, "#7030c0"], [p.w + 1, "#c070ff"], [1, "#fff0ff"]] as const) {
        ctx.strokeStyle = col;
        ctx.lineWidth = width;
        ctx.beginPath();
        ctx.moveTo(p.x0, p.y0);
        ctx.quadraticCurveTo(p.x0 + wob, cy, p.x1, p.y1);
        ctx.stroke();
      }
    }
    ctx.lineWidth = 1;
    const styles: Record<number, [string, number, number]> = {
      [Shot.Vulcan]: ["#fff2a0", 2, 7], [Shot.Laser]: ["#80d8ff", 3, 16], [Shot.Dumbfire]: ["#f0f0f0", 2, 7],
      [Shot.Homing]: ["#a0ffd0", 2, 6], [Shot.Bomblet]: ["#ffa040", 3, 4], [Shot.Split]: ["#ffe060", 2, 3], [Shot.Burst]: ["#ff80ff", 3, 3],
    };
    for (const kind of Object.keys(styles).map(Number)) {
      const [col, sw, sh] = styles[kind];
      ctx.fillStyle = col;
      for (let i = 0; i < S.n; i++) if (S.k[i] === kind) ctx.fillRect(Math.round(S.x[i] - sw / 2), Math.round(S.y[i] - sh / 2), sw, sh);
    }
    // Hot cores on lasers and missile tips.
    ctx.fillStyle = "#fff";
    for (let i = 0; i < S.n; i++) if (S.k[i] === Shot.Laser) ctx.fillRect(Math.round(S.x[i]), Math.round(S.y[i] - 7), 1, 14);
    ctx.fillStyle = "#f44";
    for (let i = 0; i < S.n; i++) if (S.k[i] === Shot.Dumbfire) ctx.fillRect(Math.round(S.x[i] - 1), Math.round(S.y[i] - 4), 2, 2);
    ctx.globalAlpha = 1;
  }

  drawPlayer() {
    const w = this.w;
    if (!w.alive) return;
    const sh = w.ship;
    if (w.inv > 0 && Math.floor(w.inv / 3) % 2 === 0 && w.phase === "play") {
      // Blink while invulnerable, but keep the hitbox visible.
    } else {
      // Exhaust flicker.
      for (const n of sh.nozzles) {
        const len = 3 + ((w.t * 7 + n.x) % 4) + (isHeld("up") ? 3 : 0);
        ctx.fillStyle = "#3a8cff";
        ctx.fillRect(Math.round(w.px + n.x - 2), Math.round(w.py + n.y + 4), 4, len);
        ctx.fillStyle = "#e8f8ff";
        ctx.fillRect(Math.round(w.px + n.x - 1), Math.round(w.py + n.y + 4), 2, Math.max(1, len - 2));
      }
      const sx = 1 - Math.abs(w.bank) * 0.2;
      const dw = Math.round(sh.w * sx);
      ctx.drawImage(sh.c, Math.round(w.px - sh.ax * sx), Math.round(w.py - sh.ay), dw, sh.h);
    }
    if (w.shields > 0 && w.phase !== "launch") {
      ctx.strokeStyle = "#60f0ff";
      ctx.globalAlpha = 0.25 + 0.1 * Math.sin(w.t * 0.15);
      ctx.beginPath();
      ctx.arc(w.px, w.py + 4, Math.max(sh.w, sh.h) / 2 + 2, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
    if (w.phase !== "launch") {
      // The hitbox core: always bright, always on top.
      const r = w.build.hitbox + (w.focus ? 1.5 : 0.5);
      ctx.fillStyle = "#ff3070";
      ctx.beginPath(); ctx.arc(w.px, w.py, r + 1.2, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = "#fff";
      ctx.beginPath(); ctx.arc(w.px, w.py, r, 0, Math.PI * 2); ctx.fill();
    }
  }

  drawPickup(p: Pickup) {
    const t = this.w.t;
    const x = Math.round(p.x), y = Math.round(p.y);
    if (p.kind === "medal") {
      const sw = Math.max(1, Math.round(Math.abs(Math.cos(p.t * 0.15)) * 5));
      ctx.fillStyle = "#5a3a00"; ctx.fillRect(x - sw - 1, y - 6, sw * 2 + 2, 12);
      ctx.fillStyle = "#ffc828"; ctx.fillRect(x - sw, y - 5, sw * 2, 10);
      ctx.fillStyle = "#fff4b0"; ctx.fillRect(x - Math.max(1, sw - 2), y - 4, Math.max(1, sw - 1), 4);
      return;
    }
    if (p.kind === "loot") {
      const col = RARITY_COLOR[p.item!.rarity];
      const g = ctx.createLinearGradient(0, y - 60, 0, y);
      g.addColorStop(0, "rgba(255,255,255,0)");
      g.addColorStop(1, col);
      ctx.globalAlpha = 0.35 + 0.15 * Math.sin(t * 0.1);
      ctx.fillStyle = g;
      ctx.fillRect(x - 3, y - 60, 6, 60);
      ctx.globalAlpha = 1;
      const icon = img[`icons_${[0, 1, 2, 3, 4, 5, 6, 7, 8][iconFor(p)]}`];
      ctx.fillStyle = "#000";
      ctx.fillRect(x - 8, y - 8, 16, 16);
      ctx.drawImage(icon, x - 7, y - 7, 14, 14);
      ctx.strokeStyle = col;
      ctx.strokeRect(x - 8.5, y - 8.5, 17, 17);
      return;
    }
    const [bg, label] = p.kind === "P" ? ["#d02828", "P"] : p.kind === "B" ? ["#20a040", "B"] : ["#8030c0", "D"];
    const pulse = t % 20 < 10;
    ctx.fillStyle = "#000"; ctx.fillRect(x - 7, y - 6, 14, 12);
    ctx.fillStyle = pulse ? bg : "#fff"; ctx.fillRect(x - 6, y - 5, 12, 10);
    text(label, x, y - 3, { align: "center", color: pulse ? "#fff" : bg, shadow: null });
    if (p.kind === "D") {
      const d = p.drafts![Math.floor(p.t / 50) % 3];
      const cols = ["#ff80ff", "#80ffff", "#ffff80"];
      text(d.label, Math.max(40, Math.min(W - 40, x)), y - 16, { align: "center", color: cols[Math.floor(p.t / 50) % 3] });
    }
  }

  drawFx(top: boolean) {
    for (const f of this.w.fx) {
      if (f.t < 0) continue;
      const isTop = f.kind === "text" || f.kind === "flash";
      if (isTop !== top) continue;
      switch (f.kind) {
        case "boom": {
          const frame = Math.min(7, Math.floor(f.t / 3));
          const im = img[`explosion_${frame}`];
          const s = f.s;
          ctx.drawImage(im, Math.round(f.x - (im.width * s) / 2), Math.round(f.y - (im.height * s) / 2), Math.round(im.width * s), Math.round(im.height * s));
          break;
        }
        case "spark":
          ctx.fillStyle = f.color!;
          ctx.fillRect(Math.round(f.x), Math.round(f.y), f.t < 4 ? 2 : 1, f.t < 4 ? 2 : 1);
          break;
        case "text":
          text(f.text!, f.x, f.y - 4, { align: "center", color: f.color });
          break;
        case "ring":
          ctx.strokeStyle = f.color!;
          ctx.globalAlpha = 1 - f.t / f.life;
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(f.x, f.y, (f.s * f.t) / f.life, 0, Math.PI * 2);
          ctx.stroke();
          ctx.lineWidth = 1;
          ctx.globalAlpha = 1;
          break;
        case "flash":
          ctx.fillStyle = "#fff";
          ctx.globalAlpha = 0.85 * (1 - f.t / f.life);
          ctx.fillRect(0, 0, W, H);
          ctx.globalAlpha = 1;
          break;
      }
    }
  }

  drawBullets() {
    const B = this.w.bullets;
    for (let i = 0; i < B.n; i++) {
      const kind = BULLET_KINDS[B.k[i]];
      const im = BULLET[kind];
      if (kind === "needle") {
        ctx.save();
        ctx.translate(Math.round(B.x[i]), Math.round(B.y[i]));
        ctx.rotate(Math.atan2(B.vy[i], B.vx[i]) - Math.PI / 2);
        ctx.drawImage(im, -2, -5);
        ctx.restore();
      } else ctx.drawImage(im, Math.round(B.x[i] - im.width / 2), Math.round(B.y[i] - im.height / 2));
    }
  }

  drawTelegraphs() {
    const w = this.w;
    for (const tg of w.telegraphs) {
      if (Math.floor(tg.t / 5) % 2) continue;
      const g = ctx.createLinearGradient(0, 0, 0, 24);
      g.addColorStop(0, "rgba(255,60,60,0.8)");
      g.addColorStop(1, "rgba(255,60,60,0)");
      ctx.fillStyle = g;
      ctx.fillRect(tg.x - 24, 0, 48, 24);
      ctx.fillStyle = "#fff";
      for (let k = 0; k < 5; k++) ctx.fillRect(Math.round(tg.x - 4 + k), 4 + k, 9 - k * 2, 1);
      ctx.fillStyle = "#ff4040";
      ctx.fillRect(Math.round(tg.x - 1), 10, 3, 2);
    }
    if (w.bossWarning > 0 && Math.floor(w.bossWarning / 12) % 2 === 0) {
      ctx.fillStyle = "rgba(160,0,0,0.6)";
      ctx.fillRect(0, H / 2 - 30, W, 60);
      ctx.fillStyle = "#ff3030";
      ctx.fillRect(0, H / 2 - 30, W, 3);
      ctx.fillRect(0, H / 2 + 27, W, 3);
      text("WARNING", W / 2, H / 2 - 20, { align: "center", scale: 3, color: "#fff" });
      text("HUGE ENEMY APPROACHING", W / 2, H / 2 + 12, { align: "center", color: "#ffd0d0" });
    }
  }

  drawHud() {
    const w = this.w;
    text(String(w.score).padStart(8, "0"), 4, 3, { color: "#fff" });
    if (w.chain > 0) text(`CHAIN ${w.chain}`, W / 2, 3, { align: "center", color: "#ffd040" });
    text(tierName(w.tier), W - 4, 3, { align: "right", color: w.tier ? "#ff6060" : "#a0c0ff" });
    if (w.boss) {
      const b = w.boss;
      ctx.fillStyle = "#000"; ctx.fillRect(40, 14, W - 80, 6);
      ctx.fillStyle = "#ff3030"; ctx.fillRect(41, 15, Math.max(0, (W - 82) * (b.hp / b.maxHp)), 4);
      text(w.bossName, W / 2, 22, { align: "center", color: "#ffb0b0" });
    }
    // Hull pips, shields and bombs.
    for (let i = 0; i < w.build.hp; i++) {
      const x = 5 + i * 9, y = H - 11;
      ctx.fillStyle = "#000"; ctx.fillRect(x - 1, y - 1, 9, 9);
      ctx.fillStyle = i < w.hp ? "#ff3838" : "#402020"; ctx.fillRect(x, y, 7, 7);
      if (i < w.hp) { ctx.fillStyle = "#ffb0b0"; ctx.fillRect(x + 1, y + 1, 2, 2); }
    }
    for (let i = 0; i < w.build.shields; i++) {
      const x = 5 + i * 9, y = H - 21;
      ctx.fillStyle = "#000"; ctx.fillRect(x - 1, y - 1, 9, 8);
      ctx.fillStyle = i < w.shields ? "#40e8ff" : "#183840"; ctx.fillRect(x, y, 7, 6);
    }
    if (w.shields < w.build.shields) {
      const f = w.shieldT / (w.build.recharge * 60);
      ctx.fillStyle = "#40e8ff";
      ctx.fillRect(5 + w.shields * 9, H - 15, Math.round(7 * f), 1);
    }
    text(`P${w.p}`, W - 4, H - 22, { align: "right", color: w.p >= 8 ? "#ffe040" : "#fff" });
    for (let i = 0; i < Math.min(w.bombs, 8); i++) {
      const x = W - 12 - i * 10, y = H - 12;
      ctx.fillStyle = "#000"; ctx.fillRect(x - 1, y - 1, 9, 10);
      ctx.fillStyle = "#30c050"; ctx.fillRect(x, y, 7, 8);
      ctx.fillStyle = "#c0ffc0"; ctx.fillRect(x + 2, y + 1, 3, 2);
    }
    if (w.phase === "launch" && w.phaseT < 100) {
      text("SORTIE", W / 2, H / 2 - 60, { align: "center", scale: 2, color: "#fff" });
      text(`${tierName(w.tier)} - COASTAL LAUNCH`, W / 2, H / 2 - 40, { align: "center", color: "#a0c0ff" });
      text("Z FIRE   X BOMB   SHIFT PRECISION", W / 2, H / 2 - 24, { align: "center", color: "#ccc" });
    }
    if (w.phase === "clear" && w.phaseT > 120) text("MISSION COMPLETE", W / 2, H / 2 - 30, { align: "center", scale: 2, color: "#ffe040" });
    if (w.phase === "dead" && w.phaseT > 60) text("SHOT DOWN", W / 2, H / 2 - 30, { align: "center", scale: 2, color: "#ff6060" });
  }

  drawPause() {
    ctx.fillStyle = "rgba(0,0,20,0.7)";
    ctx.fillRect(0, 0, W, H);
    text("PAUSED", W / 2, 120, { align: "center", scale: 2 });
    const o = profile.options;
    const bar = (v: number) => "<" + "=".repeat(Math.round(v * 10)).padEnd(10, ".") + ">";
    const rows = ["RESUME", `SHOT OPACITY ${bar(o.shotAlpha)}`, `MUSIC        ${bar(o.music)}`, `SFX          ${bar(o.sfx)}`, "RETREAT TO HANGAR"];
    rows.forEach((r, i) => text((i === this.menu ? "> " : "  ") + r, 50, 160 + i * 14, { color: i === this.menu ? "#ffe040" : "#ccc" }));
    text("LOOT COLLECTED SO FAR IS KEPT", W / 2, 250, { align: "center", color: "#888" });
  }
}

function iconFor(p: Pickup): number {
  const base = p.item!.base;
  return ({ wasp: 0, falcon: 0, bastion: 0, gunwing: 1, balwing: 1, bomwing: 1, sprint: 2, cruise: 2, burner: 2, vulcan: 3, laser: 4, plasma: 5, dumbfire: 6, homing: 7, nuke: 8, cluster: 8 } as Record<string, number>)[base];
}
