/** Minimal scene stack. */
export interface Scene {
  update(): void;
  draw(): void;
  enter?(): void;
}

let current: Scene | null = null;
export function setScene(s: Scene) {
  current = s;
  s.enter?.();
}
export const scene = () => current;
