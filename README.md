# Project Raiden: Shmup Looter — Prototype 0

A Raiden DX-style vertical shmup where every part of your fighter is loot. SNES-fidelity HTML5 canvas prototype of
[the design doc](./Project%20Raiden%20Shmup%20Looter%20—%20Game%20Design%20Doc.md): Biome 1 level 1 (Coastal Launch),
hangar with an energy budget, seeded loot with affixes, Hell tiers.

**Play:** https://seagoats.github.io/raiden-proc/

## Controls

| | Keyboard | Gamepad |
|---|---|---|
| Move | Arrows / WASD | D-pad / stick |
| Fire (hold) | Z / J / Space | A |
| Bomb | X / K | B |
| Precision (slow) | Shift / C | Shoulders |
| Pause | Esc / Enter / P | Start |
| Scrap item (hangar) | R / Delete | X |

Touch: drag anywhere to fly (auto-fire), tap with a second finger to bomb.

## What's in

- **Hangar:** hull / wings / engine plus up to 3 main, 3 ordnance and 1 bomb hardpoints (wings decide how many). Hull
  energy is the fitting budget. The ship sprite is composited from the equipped parts and shows mounted weapons.
- **Weapons:** Vulcan, Laser, Plasma (lock-on strands), Dumbfire and Homing missiles, Nuke and Cluster bombs, all
  firing at once.
- **Loot:** items are `(base, ilvl, rarity, seed)`; affixes re-derive from the seed. Common / Magic / Rare / Unique,
  with "numbers that sound broken" rolls. The stat pipeline runs base → weapon affixes → part globals → in-run
  (inc adds within a layer, layers and "more" multiply).
- **In-run:** P items, colour-cycling draft pickups (grab it while it shows the upgrade you want), bombs, a Raiden DX
  medal chain that drives magic find, loot capsules with rarity beams.
- **Durability:** hit pips, regenerating shield charges, i-frames, an always-visible hitbox core, precision mode.
  A hull hit costs one P level.
- **Hell tiers:** clearing a tier unlocks the next: more HP, denser bullets, higher item levels, and enemy affixes
  (armored, revenge, splitter, relentless, shielder) with aura colours.
- Stash and options persist in `localStorage`.

## Credits

- **Enemy fighters:** [Graftwing](https://github.com/tstone/graftwing) by tstone, vendored as a git submodule
  (`vendor/graftwing`). Every enemy squadron is a Graftwing ship rolled from seeds (`src/gfx/shipgen.ts`), and each
  Hell tier remixes the designs.
- **Art:** stage backgrounds, carrier, boss, boats, turrets, explosions, icons, player parts, title and hangar were
  generated with Codex (`art/assets.json` holds the prompts) and converted to 15-bit SNES palettes by `art/process.py`.

- **Audio:** Chequered Ink's 400 Sounds Pack (SFX and jingles), Dillon Becker's Super Dialogue Audio Pack (CC BY 4.0,
  ops radio callouts and pilot voice) and NOX Sound ambience (CC0), all processed by `art/sounds.py`. Music is a
  runtime chip synth. Full attributions in [CREDITS.md](./CREDITS.md).

## Development

```sh
git clone --recursive https://github.com/Seagoats/raiden-proc && cd raiden-proc
npm install
npm run dev
```

Regenerating art needs the Codex CLI: `python3 art/gen.py [names...]` writes `art/raw/` (gitignored), then
`art/.venv/bin/python art/process.py` rebuilds `public/assets/` (`pip install pillow numpy scipy`).
Audio: `python3 art/sounds.py <400 Sounds Pack.zip> <Super Dialogue Audio Pack v1.zip> <Essentials_Series_NOX_SOUND.zip>`
(needs ffmpeg) rebuilds `public/sfx/`.

**Local music overrides:** drop `stage.mp3`, `boss.mp3` and/or `hangar.mp3` into `public/music-local/` to replace the
synth tracks while running locally. That folder is gitignored and never deployed; use it for reference tracks you
don't have rights to ship.
