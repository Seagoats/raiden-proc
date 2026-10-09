# Project Raiden: Shmup Looter — Game Design Doc

Oct 8, 2026 · @Minh

## Vision & pillars

A Raiden DX-style vertical shmup where you build your fighter from looted parts, and your build grows until the top half of the screen is your own bullet hell. Classic shmup feel in the campaign; Diablo-style power growth and an endless endgame ladder after it.

- **Power growth is the point.** Gear is allowed to trivialize earlier content. Challenge comes from climbing difficulty tiers, not from capping the player.
- **Numbers that sound broken.** Vampire Survivors-style rolls ("AMOUNT +10", "cooldown −75%") are a feature. The stat pipeline keeps them tunable.
- **Offense is defense.** Enemies that die on entry never fire. Power growth naturally turns dodging into dominating.
- **Build it from scratch.** CATS-style: every part of the ship is loot, and the ship visibly shows the build.
- **Fair, readable danger.** One telegraph language for every threat; enemy bullets always legible over the player's output.
- **Earned spectacle.** Hand-crafted campaign beats, led by the wrecked-carrier launch into space.

## Core loop

&#91;embedded content: core loop · 4 steps\]

A sortie is one stage run. Gear sets the starting build, in-run pickups make it louder, drops feed the hangar, and a stronger fit unlocks the next tier. Earlier content becomes farmable on the way up.

## Campaign structure

Four biomes, each teaching one new question; its boss is the final exam and uses the biome's lesson against the player. Pattern per biome: lesson A, lesson B, A + B + boss.

| Biome | Twist taught | Level 1 | Level 2 | Level 3 + boss | Loot identity |
| --- | --- | --- | --- | --- | --- |
| 1. Coastal launch | Directional spawns | Classic top-entry waves | Spawns from sides and behind | Mixed + boss | Rear guns, side mounts, orbitals |
| 2. Ocean / volcanic | Environmental cues | Water and lava spouts | Enemies erupt from terrain ahead | Mixed + sea serpent (dives, resurfaces, spouts as attacks) | Hazard resistance, shots that trigger terrain |
| 3. Enemy R&D (industrial / sky fortress) | Affix enemies | One affix at a time | Affix combos | Boss with an affix per phase | On-kill effects mirroring enemy affixes |
| 4. Space | Everything combined | Omnidirectional threats from debris fields | Affixed waves | Final boss (The Core) | Chase uniques |

**The carrier moment.** Game opens with an unhurried launch from the carrier. Biomes 1–3 leave traces of it under attack (distress calls, marked debris, a flyover under fire). After biome 3, the fighter returns to the same carrier, same framing, now wrecked. Music cuts out, the ship holds a beat too long, relaunches; the background melts away into space and a new track starts. No dialogue or text.

**Unlock:** beating the final boss unlocks Hell mode on every biome.

## Hell mode endgame

Hell mode replays any biome at endgame scaling with remixed mechanics; it is where the permanent loot grind lives. It is a ladder, not a single max tier, so freshly finished campaign gear has a stepping stone.

- **Tiers Hell 1 → Hell N.** Each step raises enemy HP and bullet density and adds one affix slot drawn from the biome-twist pool.
- **Remixing.** Any biome can roll any learned twist: magnetic bullets in the fog biome, rear spawns from water, affixed elites in space. Players already know every piece from the campaign.
- **Chase loot.** Certain uniques and rarities only drop at or above a tier threshold (for example, Hell 5+).
- **Trivializing is the reward.** Farming Hell 3 in your sleep on the way to pushing Hell 8 is intended.
- **Score as a second ladder.** Kill speed, medal chains and no-hit bonuses scale with build strength, so solved tiers still have leaderboards. Timed or score-gated "greater sorties" are a candidate endgame mode.
- **Danger that resists deletion.** High tiers lean on armored elites, revenge bullets and on-death hazards rather than damage caps.

## Ship building

A ship is three looted parts plus the weapons and bombs mounted on them. The hull's energy capacity is the fitting budget; everything mounted draws from it.

| Part | Owns | Contributes | Example range |
| --- | --- | --- | --- |
| Hull | Energy capacity, hit points, shield charges, hitbox class | Global defensive affixes | Light: 2 hits, tiny hitbox · Heavy: up to 7 hits, large hitbox |
| Wings | Main, ordnance and bomb hardpoints; handling (acceleration, precision speed) | Small durability, weapon-boosting affixes | Gunship 3 main / 0 ordnance · Bomber 1 / 3 · Balanced 2 / 1 |
| Engines | Top speed, lateral and forward/back as separate stats | Energy draw, movement affixes (dash, afterburner) | Lateral speed is the dodge axis; vertical is positioning |

**Durability.** Hull HP is counted in discrete hits shown as pips; it does not regenerate during a stage except via repair pickups. Shields are separate regenerating charges, each absorbing one hit. Every hit grants generous, clearly signaled invulnerability frames. "+1 hit" exists only as a rare affix.

**Hitbox.** Fixed per hull class and always rendered as a bright core, never changed by affixes.

**Precision mode.** Holding a button (or firing) drops the ship to a fixed slow speed for threading patterns, so large speed rolls stay pure upside. Wings tune precision speed.

**Energy.** A static fitting budget, like weight in Armored Core, not a runtime resource. A strong wing on a weak hull may leave hardpoints empty.

## Weapons & bombs

All mounted weapons fire simultaneously, extending Raiden's main + missile model to N hardpoints. Every weapon shares one stat vocabulary (amount, spread, damage, fire rate, projectile speed, pierce) that each type interprets differently.

| Type | Slot | "Amount" means | Identity |
| --- | --- | --- | --- |
| Vulcan | Main | Bullets per volley | Spread coverage; the best scaler for big amount rolls |
| Laser | Main | Parallel beams | Native pierce, strong single-target damage |
| Plasma | Main | Toothpaste strands, each locking a different target | Bending lock-on beams; amount becomes screen coverage |
| Dumbfire missiles | Ordnance | Missiles per salvo | High damage, straight flight |
| Homing missiles | Ordnance | Missiles per salvo | Lower damage, guaranteed hits |
| Nuke bomb | Bomb | Stock | Delayed screen-wide blast, clears bullets |
| Cluster bomb | Bomb | Stock | Spread of homing bomblets, partial bullet clear |

**Bomb affixes:** cleared bullets become medals, bombs restore a shield charge, bombs leave a damaging field, extra stock, faster recharge. Pickups during a run still add bomb stock the classic way.

## Loot & affixes

Every hull, wing, engine, weapon and bomb is a looted item with a base type, item level, rarity and rolled affixes. Rarity sets the affix count and the visual tier.

| Rarity | Affixes | Notes |
| --- | --- | --- |
| Common | 0 | Base stats only |
| Magic | 1–2 |  |
| Rare | 3–4 | Main build-crafting tier |
| Unique | Fixed set + 1 build-defining effect | Some gated to Hell tiers |

**Affix families**

- **Weapon:** +amount, +spread, damage, fire rate, projectile speed, pierce, chain, split on kill.
- **Global (on parts):** "+N amount to all weapons", "all cooldowns −X%", damage vs elites, magic find.
- **Defensive:** shield charges, shield recharge, on-shield-break effects (bullet-clearing shockwave, damage buff, homing burst, longer invulnerability), rare +1 hit.
- **Movement:** lateral speed, vertical speed, precision speed, dash.
- **Mirrored enemy affixes:** your kills leave shields, your bullets gravity-well, your kills fire revenge bursts.

**Stat pipeline.** Modifiers stack in a fixed order so broken numbers stay traceable:

1. Weapon base stats
2. Weapon affixes
3. Part affixes (global)
4. In-run drafts and P levels

Within a layer, "increased" modifiers add; across layers, "more" modifiers multiply (Path of Exile model).

**Biome loot identity.** Each biome's drop pool answers the problem it teaches (see Campaign structure).

**Magic find from skill.** The medal chain, not gear, is the main driver of drop quality.

## In-run power

Gear sets the build's foundation; pickups during a sortie multiply it. Every stage starts at a solid baseline and ends with a screen-filling weapon.

- **P items** raise shot level on mounted weapons; they never swap your weapons.
- **Draft pickups** cycle through three rolled upgrades (for example "AMOUNT +2", "+30% fire rate", "lasers pierce"). You choose by grabbing it while it shows the one you want: no pause menu, and risky positioning becomes part of building.
- **Bomb pickups** add stock.
- **Medals** chain like Raiden DX: each collected medal is worth more, missing one resets the chain. The chain drives score and magic find.
- **Graze meter (candidate).** Passing close to bullets charges a meter that graze-based affixes consume.

## Enemy affixes & telegraph language

Biome 1 establishes one telegraph language that every later threat reuses: edge-of-screen glow with an arrow, a sound cue, and at least half a second of lead time. Terrain spawns telegraph with bubbling water or a shadow under the surface.

Enemy affixes are introduced in biome 3 and form the Hell mode modifier pool. Each has its own aura color or particle effect, read at a glance like Diablo champion packs.

| Affix | Behavior | Teaches |
| --- | --- | --- |
| Hazard trail | Leaves mines or fire behind | Route planning |
| Gravity well | Bends nearby bullets, including yours | Positioning |
| Relentless | Keeps chasing until killed | Target priority |
| Shield-on-death (allies) | Shields nearby enemies when killed | Kill order |
| Shield-on-death (player) | Drops a shield charge for the player | Risky pickups |
| Splitter | Breaks into smaller copies | Area damage value |
| Revenge | Fires a burst on death | Kill distance |
| Linked | Pair invulnerable until both die | Split focus |
| Reflector | Bounces your shots back briefly | Fire discipline |
| Armored | Takes seconds to crack | Sustained damage |

## Readability & presentation

When the player fills the screen, enemy bullets must still read instantly.

- Player shots are translucent and dimmer; a player-shot opacity slider is in the options.
- Enemy bullets use a reserved high-contrast palette with outlines that no player effect may use.
- The hitbox core is always drawn bright on top of the ship.
- HP is pips, shields are a separate ring or pip row, bombs a stock counter.
- Mounted weapons are visible on the ship's wing hardpoints, so the ship shows the build.
- Art direction follows the concept boards: painterly pixel stages (coastal, industrial, mountain pass, sky fortress, space), chunky mechanical bosses, red/blue/green/gold/purple chassis palettes.

## Tech architecture

Engine is undecided; the first prototype is a single-file HTML5 canvas build to validate feel before committing.

- **Bullets.** Pool everything, no per-bullet scene objects, batch rendering (Canvas 2D now; Godot MultiMesh or GPU instancing later). Circle collisions against a spatial hash.
- **Determinism.** Fixed-timestep simulation from day one, which enables input replays for debugging deaths and for leaderboards.
- **Seeded items.** Every item is fully defined by `(base_type, item_level, rarity, seed)`; affixes are re-derived from the seed. Saves stay tiny and ship builds are shareable as short codes.
- **Proc-gen visuals.** Each part generates its sprite from its seed using mask-based symmetric pixel generation (after Dave Bollinger's spaceship generator): a half-mask of solid / maybe / empty cells, randomized, mirrored, outlined, tinted by rarity. Parts composite via socket points: hull on the centerline, wings mirrored onto hull sockets, engines at the rear, weapons on wing hardpoints.
- **Data-driven content.** Waves, enemy types, affixes and item bases live in data tables so biomes and Hell modifiers are content work, not code work.

## Prototype scope & open questions

Prototype 0 answers one question: does flying into a stage with a busted build feel great?

- [ ] Biome 1 level 1: top-entry waves with a mini-boss
- [ ] Hangar with hull, wings, engines and hardpoints, energy budget enforced
- [ ] Vulcan, laser, plasma, dumbfire and homing missiles, nuke bomb, all firing simultaneously
- [ ] Seeded loot drops with rarities and a starter affix pool
- [ ] Hit-pip HP, shield charges, invulnerability frames, precision mode
- [ ] P items and color-cycling draft pickups
- [ ] Medal chain
- [ ] Proc-gen part sprites composited from seeds
- [ ] Stash persisted in the browser

**Open questions**

- Do bombs get a dedicated slot on every wing, or compete with ordnance slots?
- Is the graze meter in or out?
- Does taking a hit cost in-run P levels (classic Raiden death penalty, lite)?
- Engine for the production build: Godot, Unity, or stay on web?
- Working title, since "Raiden" is an existing trademark if this ever ships.
