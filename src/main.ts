/** Boot: load art, then run a fixed 60 Hz simulation with rendering on animation frames. */
import { ctx, W, H } from "./gfx/screen";
import { text } from "./gfx/font";
import { loadAssets } from "./gfx/assets";
import { poll, endTick } from "./core/input";
import { syncOptions } from "./game/save";
import { scene, setScene } from "./scenes/scene";
import { TitleScene } from "./scenes/title";

const STEP = 1000 / 60;
let acc = 0;
let last = performance.now();

function frame(now: number) {
  acc += Math.min(250, now - last);
  last = now;
  let steps = 0;
  while (acc >= STEP && steps < 5) {
    tick();
    acc -= STEP;
    steps++;
  }
  if (steps === 5) acc = 0;
  scene()?.draw();
  requestAnimationFrame(frame);
}

function tick() {
  poll();
  scene()?.update();
  endTick();
}

// Dev-only hook for automated playtests in backgrounded tabs (no animation frames there).
if (import.meta.env.DEV) {
  (window as any).dbg = {
    tick(n = 1) { for (let i = 0; i < n; i++) tick(); scene()?.draw(); },
    scene,
    /** Upscaled 2x snapshot of the framebuffer, saved by the dev server. */
    async snap(name: string) {
      const c = document.createElement("canvas");
      c.width = W * 2; c.height = H * 2;
      const x = c.getContext("2d")!;
      x.imageSmoothingEnabled = false;
      x.drawImage(document.getElementById("screen") as HTMLCanvasElement, 0, 0, W * 2, H * 2);
      await fetch(`/__snap?name=${name}`, { method: "POST", body: c.toDataURL("image/png") });
      return name;
    },
  };
}

async function boot() {
  syncOptions();
  const bar = (f: number) => {
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, W, H);
    text("LOADING", W / 2, H / 2 - 14, { align: "center" });
    ctx.fillStyle = "#334";
    ctx.fillRect(64, H / 2, W - 128, 6);
    ctx.fillStyle = "#ffe040";
    ctx.fillRect(64, H / 2, (W - 128) * f, 6);
  };
  bar(0);
  await loadAssets(bar);
  setScene(new TitleScene());
  requestAnimationFrame(frame);
}

boot().catch((e) => {
  ctx.fillStyle = "#300";
  ctx.fillRect(0, 0, W, H);
  text("FAILED TO LOAD", W / 2, H / 2, { align: "center" });
  console.error(e);
});
