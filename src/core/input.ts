/** Keyboard, gamepad, mouse and touch, polled once per simulation tick. */
import { canvas, W, H } from "../gfx/screen";

export type Action = "left" | "right" | "up" | "down" | "fire" | "bomb" | "focus" | "ok" | "back" | "pause" | "alt";

const KEYS: Record<string, Action[]> = {
  ArrowLeft: ["left"], KeyA: ["left"], ArrowRight: ["right"], KeyD: ["right"],
  ArrowUp: ["up"], KeyW: ["up"], ArrowDown: ["down"], KeyS: ["down"],
  KeyZ: ["fire", "ok"], KeyJ: ["fire", "ok"], Space: ["fire", "ok"], Enter: ["ok", "pause"],
  KeyX: ["bomb", "back"], KeyK: ["bomb", "back"], Backspace: ["back"], Escape: ["back", "pause"],
  ShiftLeft: ["focus"], ShiftRight: ["focus"], KeyC: ["focus"], KeyL: ["focus"], KeyP: ["pause"],
  Delete: ["alt"], KeyR: ["alt"],
};

const down = new Set<string>();
/** Keys pressed since the last poll, so a tap shorter than a tick still registers. */
const tapped = new Set<string>();
const held = new Set<Action>();
let prev = new Set<Action>();
let now = new Set<Action>();

window.addEventListener("keydown", (e) => {
  if (KEYS[e.code]) e.preventDefault();
  down.add(e.code);
  tapped.add(e.code);
  touch.active = false;
});
window.addEventListener("keyup", (e) => down.delete(e.code));
window.addEventListener("blur", () => down.clear());

export const mouse = { x: -1, y: -1, clicked: false, moved: false, wheel: 0, down: false };
const toLocal = (cx: number, cy: number) => {
  const r = canvas.getBoundingClientRect();
  return [((cx - r.left) / r.width) * W, ((cy - r.top) / r.height) * H];
};
let clickQueued = false;
canvas.addEventListener("mousemove", (e) => {
  [mouse.x, mouse.y] = toLocal(e.clientX, e.clientY);
  mouse.moved = true;
});
canvas.addEventListener("mousedown", (e) => {
  [mouse.x, mouse.y] = toLocal(e.clientX, e.clientY);
  mouse.down = true;
  clickQueued = true;
});
window.addEventListener("mouseup", () => (mouse.down = false));
canvas.addEventListener("wheel", (e) => {
  mouse.wheel += Math.sign(e.deltaY);
  e.preventDefault();
}, { passive: false });

/** Touch: drag anywhere to move the ship relatively; a second finger bombs; taps click menus. */
export const touch = { active: false, dx: 0, dy: 0, bomb: false };
let lastTouch: [number, number] | null = null;
canvas.addEventListener("touchstart", (e) => {
  e.preventDefault();
  touch.active = true;
  if (e.touches.length >= 2) touch.bomb = true;
  const t = e.touches[0];
  lastTouch = [t.clientX, t.clientY];
  [mouse.x, mouse.y] = toLocal(t.clientX, t.clientY);
  clickQueued = true;
}, { passive: false });
canvas.addEventListener("touchmove", (e) => {
  e.preventDefault();
  const t = e.touches[0];
  if (lastTouch) {
    const r = canvas.getBoundingClientRect();
    touch.dx += ((t.clientX - lastTouch[0]) / r.width) * W;
    touch.dy += ((t.clientY - lastTouch[1]) / r.height) * H;
  }
  lastTouch = [t.clientX, t.clientY];
}, { passive: false });
canvas.addEventListener("touchend", (e) => {
  if (e.touches.length === 0) lastTouch = null;
});

function pollPad() {
  const pads = navigator.getGamepads?.() ?? [];
  for (const p of pads) {
    if (!p) continue;
    const b = (i: number) => p.buttons[i]?.pressed;
    const [ax, ay] = [p.axes[0] ?? 0, p.axes[1] ?? 0];
    if (b(14) || ax < -0.4) held.add("left");
    if (b(15) || ax > 0.4) held.add("right");
    if (b(12) || ay < -0.4) held.add("up");
    if (b(13) || ay > 0.4) held.add("down");
    if (b(0)) (held.add("fire"), held.add("ok"));
    if (b(1)) (held.add("bomb"), held.add("back"));
    if (b(2)) held.add("alt");
    if (b(4) || b(5) || b(6) || b(7)) held.add("focus");
    if (b(9)) held.add("pause");
  }
}

/** Call once per tick before reading input. */
export function poll() {
  prev = now;
  held.clear();
  for (const code of [...down, ...tapped]) for (const a of KEYS[code] ?? []) held.add(a);
  tapped.clear();
  pollPad();
  now = new Set(held);
  mouse.clicked = clickQueued;
  clickQueued = false;
}

export const isHeld = (a: Action) => now.has(a);
export const pressed = (a: Action) => now.has(a) && !prev.has(a);
/** Menu-style repeat: true on press, then every few ticks while held. */
const repeatT = new Map<Action, number>();
export function repeat(a: Action) {
  if (!now.has(a)) {
    repeatT.delete(a);
    return false;
  }
  const t = (repeatT.get(a) ?? -1) + 1;
  repeatT.set(a, t);
  return t === 0 || (t > 18 && t % 5 === 0);
}
export function endTick() {
  mouse.moved = false;
  mouse.wheel = 0;
  touch.dx = touch.dy = 0;
  touch.bomb = false;
}
