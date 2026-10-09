/** Loads the processed Codex art from public/assets. */
const NAMES = [
  "carrier", "island_a", "island_b", "island_c", "reef", "boss_gunship", "gunboat", "destroyer",
  "title_art", "hangar_bg", "bg_01", "bg_02", "bg_03", "bg_04", "bg_05", "bg_06", "bg_07", "world_map", "boss_serpent", "boss_fortress", "boss_core",
  ...[2, 3, 4].flatMap((b) => [1, 2, 3, 4, 5].map((k) => `b${b}_0${k}`)),
  ...[0, 1, 2, 3, 4].map((i) => `clouds_${i}`),
  ...[0, 1, 2, 3, 4, 5, 6, 7].map((i) => `explosion_${i}`),
  ...[0, 1, 2, 3, 4, 5, 6, 7, 8].map((i) => `icons_${i}`),
  ...[0, 1, 2, 3, 4, 5].map((i) => `turrets_${i}`),
  ...[0, 1, 2].flatMap((i) => [`phull_${i}`, `pwing_${i}`, `pengine_${i}`]),
];

export const img: Record<string, HTMLImageElement> = {};

export function loadAssets(onProgress: (f: number) => void): Promise<void> {
  let done = 0;
  return Promise.all(
    NAMES.map(
      (n) =>
        new Promise<void>((res, rej) => {
          const im = new Image();
          im.onload = () => {
            img[n] = im;
            onProgress(++done / NAMES.length);
            res();
          };
          im.onerror = () => rej(new Error(`asset ${n}`));
          im.src = `assets/${n}.png`;
        }),
    ),
  ).then(() => undefined);
}
