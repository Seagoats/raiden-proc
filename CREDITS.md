# Credits

## Ships
- **Graftwing** by tstone — https://github.com/tstone/graftwing (git submodule `vendor/graftwing`). Generates every
  enemy fighter.

## Art
- Generated with **Codex** (OpenAI) from the prompts in `art/assets.json`, converted to 15-bit SNES palettes by
  `art/process.py`.

## Audio
All clips in `public/sfx/` were modified by `art/sounds.py`: converted to mono, resampled to 32 kHz, low-pass filtered,
trimmed, peak-normalised and re-encoded as MP3. Voice lines were also band-passed and bit-crushed for a radio effect,
and ambience was cut into crossfaded loops.

- **Super Dialogue Audio Pack V1** by **Dillon Becker** (dillonbecker.com), licensed under
  [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). Used: ops radio voice (Meghan Christian) and pilot voice
  (Sean Lenhart). Changes as described above. This project is not endorsed by the licensor.
- **400 Sounds Pack** by **Chequered Ink** — https://ci.itch.io/400-sounds-pack. Free for any use including commercial,
  credit optional; the unaltered assets may not be sold or redistributed as standalone game assets. Only processed
  versions ship here, as part of the game. Used: explosions, power-ups, coins, UI, jingles.
- **NOX Sound Essentials Series** by Nox Sound — CC0. Used: sea and sci-fi bunker ambience.
- Music and rapid-fire weapon sounds are synthesised at runtime (`src/core/audio.ts`).
