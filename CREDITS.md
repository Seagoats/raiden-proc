# Credits

## Ships
- **Graftwing** by tstone — https://github.com/tstone/graftwing (git submodule `vendor/graftwing`). Generates every
  enemy fighter.

## Art
- Generated with **Codex** (OpenAI) from the prompts in `art/assets.json`, converted to 15-bit SNES palettes by
  `art/process.py`.

## Audio
- **400 Sounds Pack** by **Chequered Ink** — https://ci.itch.io/400-sounds-pack. Free for any use including commercial,
  credit optional; the unaltered assets may not be sold or redistributed as standalone game assets. Only processed
  versions ship here (mono, 32 kHz, low-passed, trimmed, normalised by `art/sounds.py`), as part of the game.
  Used: explosions, pickups, coins, UI blips, warning alarm.
- **Stage music:** "Arcade Classics" by the project owner (made with Suno), `public/music/stage.mp3`.
- Weapon fire and the remaining music (boss, hangar) are synthesised at runtime (`src/core/audio.ts`).
