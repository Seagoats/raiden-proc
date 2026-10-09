# Project Raiden: Shmup Looter — Prototype 0

> Unofficial fan project inspired by the Raiden games. Not affiliated with or endorsed by Seibu Kaihatsu or MOSS.

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

- **Campaign map:** four areas (Coastal Launch, Volcanic Sea, Sky Fortress, Orbit) with three levels each. Clearing a
  level unlocks the next; Orbit opens after the Sky Fortress; beating The Core unlocks Hell tiers.
- **Levels:** each area teaches one twist (side and rear entries, lava spouts and surfacing turrets, affixed enemies,
  everything at once). x-1 ends with a Graftwing guardian, x-2 previews the area boss, x-3 is the full boss.
- **Progression:** the starter ship is deliberately weak (one Vulcan, empty ordnance rail, slow engines). Enemies get
  tougher, faster, more aggressive and more numerous across the 12 levels. Each level drops one item from its boss,
  sometimes two, so the ship grows piece by piece. Replay earlier levels to farm.
- **Hangar schematic:** hull / wings / engine plus up to 3 main, 3 ordnance and 1 bomb hardpoints (wings decide how
  many), each wired to its spot on the ship. Hull energy is the fitting budget. The stash picker previews the swap.
- **Weapons:** Vulcan, Laser, Plasma (lock-on strands), Dumbfire and Homing missiles, Nuke and Cluster bombs, all
  firing at once.
- **Loot:** items are `(base, ilvl, rarity, seed)`; affixes re-derive from the seed. Common / Magic / Rare / Unique.
  The stat pipeline runs base → weapon affixes → part globals → in-run (inc adds within a layer, layers and "more"
  multiply).
- **In-run:** P items, colour-cycling draft pickups (grab it while it shows the upgrade you want), bombs, a Raiden DX
  medal chain for score.
- **Durability:** hit pips, regenerating shield charges, i-frames, an always-visible hitbox core, precision mode.
  A hull hit costs one P level.

## Credits

- **Enemy fighters:** [Graftwing](https://github.com/tstone/graftwing) by tstone, vendored as a git submodule
  (`vendor/graftwing`). Every enemy squadron is a Graftwing ship rolled from seeds (`src/gfx/shipgen.ts`), and each
  Hell tier remixes the designs.
- **Art:** the world map, all four areas' background strips, the carrier, four bosses, boats, turrets, explosions,
  icons, player parts and title art were generated with Codex (`art/assets.json` holds the prompts) and converted to 15-bit SNES palettes by `art/process.py`.

- **Audio:** explosions, pickups and UI from Chequered Ink's 400 Sounds Pack, processed by `art/sounds.py`. Weapon fire
  and music are a runtime chip synth. Attributions in [CREDITS.md](./CREDITS.md).

## Development

```sh
git clone --recursive https://github.com/Seagoats/raiden-proc && cd raiden-proc
npm install
npm run dev
```

Balance sim (dev server): `const sim = await import('/tools/sim.js'); await sim.campaign(40); sim.log` plays the
campaign from a fresh save with a bot that auto-equips upgrades. It plays worse than a person.

Regenerating art needs the Codex CLI: `python3 art/gen.py [names...]` writes `art/raw/` (gitignored), then
`art/.venv/bin/python art/process.py` rebuilds `public/assets/` (`pip install pillow numpy scipy`).
Audio: `python3 art/sounds.py <400 Sounds Pack.zip>` (needs ffmpeg) rebuilds `public/sfx/`.

**Local music overrides:** drop `stage.mp3`, `boss.mp3` and/or `hangar.mp3` into `public/music-local/` to replace the
synth tracks while running locally. That folder is gitignored and never deployed; use it for reference tracks you
don't have rights to ship.
