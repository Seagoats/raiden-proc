// Campaign balance sim (dev server only). In the browser console on `npm run dev`:
//   const sim = await import('/tools/sim.js'); await sim.campaign(40); sim.log
// A simple bot plays from a fresh save: it tracks targets, sidesteps bullets and
// nearby ships, auto-equips upgrades greedily, and farms the previous level after
// two failures. It plays worse than a person, so treat results as a lower bound.
export const log = [];
export let done = false;

const key = (c, t) => window.dispatchEvent(new KeyboardEvent(t, { code: c }));
const tick = (n = 1) => window.dbg.tick(n);
const yieldFrame = () => new Promise((r) => setTimeout(r, 0));

async function mods() {
  // Use the game's module instances; a fresh import() here could load separate copies with their own state.
  return window.dbg.mods;
}

const dpsOf = (b) => b.weapons.reduce((s, x) => s + x.damage * x.rate * x.amount, 0);
const score = (b) => (!b.valid || !b.weapons.length ? -1 : dpsOf(b) * (1 + 0.25 * (b.hp - 3) + 0.2 * b.shields) * (b.lat / 1.9));

function autoEquip(M) {
  const P = M.S.profile;
  for (let guard = 0; guard < 30; guard++) {
    const map = M.S.stashMap();
    let best = score(M.ST.computeBuild(map, P.loadout));
    let bestLo = null;
    for (const it of P.stash) {
      const slot = M.IT.BASES[it.base].slot;
      const targets = slot === "main" || slot === "ord" ? [0, 1, 2].map((i) => [slot, i]) : [[slot, -1]];
      for (const [k, i] of targets) {
        const lo = structuredClone(P.loadout);
        for (const kk of ["main", "ord"]) lo[kk] = lo[kk].map((x) => (x === it.id ? null : x));
        if (i >= 0) lo[k][i] = it.id;
        else lo[k] = it.id;
        const sc = score(M.ST.computeBuild(map, lo));
        if (sc > best * 1.001) { best = sc; bestLo = lo; }
      }
    }
    if (!bestLo) return;
    P.loadout = bestLo;
  }
}

export async function play(M, levelId, tier = 0) {
  const P = M.S.profile;
  P.level = levelId;
  P.tier = tier;
  M.scene.setScene(new M.stage.StageScene());
  tick(4);
  const w = M.scene.scene().w;
  tick(270);
  key("KeyZ", "keydown");
  let t = 0;
  while (t < 260 * 60 && !w.done) {
    let tx = 144, ty = 300;
    const turrets = w.enemies.filter((e) => e.def.name === "Boss Turret");
    const target = (turrets.length ? turrets : w.enemies.filter((e) => e.y > 0 && e.y < 260 && !e.s.hidden)).sort((a, b) => b.y - a.y)[0];
    if (target) tx = target.x;
    const pk = w.pickups.filter((p) => p.y > 120 && p.kind !== "medal").sort((a, b) => b.y - a.y)[0];
    if (pk) { tx = pk.x; ty = Math.max(220, pk.y); }
    let threat = null, bd = 1e9;
    const B = w.bullets;
    for (let i = 0; i < B.n; i++) {
      const dx = B.x[i] - w.px, dy = B.y[i] - w.py;
      if (dy > -90 && dy < 14 && Math.abs(dx) < 24 && Math.abs(dx) + Math.abs(dy) < bd) { bd = Math.abs(dx) + Math.abs(dy); threat = [dx, dy]; }
    }
    for (const e of w.enemies) {
      if (!e.air || e.def.boss) continue;
      const dx = e.x - w.px, dy = e.y - w.py;
      if (Math.abs(dx) < e.hw + 22 && Math.abs(dy) < e.hh + 40 && Math.abs(dx) + Math.abs(dy) - 30 < bd) { bd = Math.abs(dx) + Math.abs(dy) - 30; threat = [dx, dy]; }
    }
    if (threat) { tx = w.px + (threat[0] > 0 ? -50 : 50); if (threat[1] > 0) ty = w.py - 30; }
    tx = Math.max(30, Math.min(258, tx));
    key("ArrowLeft", w.px > tx + 3 ? "keydown" : "keyup");
    key("ArrowRight", w.px < tx - 3 ? "keydown" : "keyup");
    key("ArrowUp", w.py > ty + 3 ? "keydown" : "keyup");
    key("ArrowDown", w.py < ty - 3 ? "keydown" : "keyup");
    tick();
    if (++t % 900 === 0) await yieldFrame();
  }
  for (const c of ["KeyZ", "ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"]) key(c, "keyup");
  tick(2); // The results scene banks loot and records the clear.
  return { id: levelId, ok: w.done === "clear", t: Math.round(t / 60), hits: w.hits, loot: w.loot.map((i) => `${i.base}/${"CMRU"[i.rarity]}${i.ilvl}`).join(",") };
}

export async function campaign(maxRuns = 40) {
  const M = await mods();
  M.S.resetProfile();
  log.length = 0;
  done = false;
  let fails = 0;
  for (let n = 0; n < maxRuns; n++) {
    const next = M.C.LEVELS.find((l) => !M.S.profile.cleared.includes(l.id));
    if (!next) break;
    const farm = fails >= 2 && next.index > 0;
    const r = await play(M, farm ? M.C.LEVELS[next.index - 1].id : next.id);
    fails = farm ? 1 : r.ok ? 0 : fails + 1;
    autoEquip(M);
    M.S.save();
    const b = M.ST.computeBuild(M.S.stashMap(), M.S.profile.loadout);
    log.push(`${r.id} ${r.ok ? "CLR" : "die"} t${r.t} h${r.hits} [${r.loot}] dps${Math.round(dpsOf(b))} hp${b.hp}/${b.shields} spd${b.lat.toFixed(1)} w${b.weapons.length}`);
  }
  done = true;
  return log;
}
