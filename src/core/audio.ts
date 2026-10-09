/** WebAudio chip synth: procedural SFX plus a tiny four-channel tracker for music. */

let ac: AudioContext | null = null;
let master: GainNode, sfxBus: GainNode, musicBus: GainNode;
let noiseBuf: AudioBuffer;
export const volume = { sfx: 0.7, music: 0.5 };

export function unlock() {
  if (ac) {
    if (ac.state === "suspended") ac.resume();
    return;
  }
  ac = new AudioContext();
  master = ac.createGain();
  master.gain.value = 0.6;
  master.connect(ac.destination);
  sfxBus = ac.createGain();
  musicBus = ac.createGain();
  sfxBus.connect(master);
  musicBus.connect(master);
  applyVolume();
  noiseBuf = ac.createBuffer(1, ac.sampleRate, ac.sampleRate);
  const d = noiseBuf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  decodeSamples();
  for (const n of trackUrl.keys()) decodeTrack(n);
  if (pendingSong) playSong(pendingSong);
}

// ---------------------------------------------------------------- samples (free packs, see CREDITS.md)

const SAMPLE_NAMES = [
  "pop", "boom", "bigboom", "blast", "pickup", "bombup", "draft", "medal", "loot", "lootrare", "hurt", "shield",
  "select", "move", "deny", "confirm", "equip", "scrap", "alarm", "whoosh",
] as const;
export type SampleName = (typeof SAMPLE_NAMES)[number];
const raw = new Map<string, ArrayBuffer>();
const buffers = new Map<string, AudioBuffer>();
/** How many samples are decoded and ready (diagnostics). */
export const loadedSamples = () => buffers.size;

/** Fetch every sample up front (no AudioContext needed); decode once audio is unlocked. */
export function preloadSamples(): Promise<void> {
  return Promise.all(SAMPLE_NAMES.map((n) =>
    fetch(`sfx/${n}.mp3`).then((r) => (r.ok ? r.arrayBuffer() : null)).then((b) => { if (b) raw.set(n, b); }).catch(() => {}),
  )).then(() => { if (ac) decodeSamples(); });
}

function decodeSamples() {
  if (!ac) return;
  for (const [n, b] of raw) {
    raw.delete(n);
    ac.decodeAudioData(b).then((buf) => buffers.set(n, buf)).catch(() => {});
  }
}

function play(name: string, opts: { rate?: number; vol?: number; bus?: GainNode; when?: number } = {}): AudioBufferSourceNode | null {
  const buf = ac && buffers.get(name);
  if (!ac || !buf) return null;
  const src = ac.createBufferSource();
  src.buffer = buf;
  src.playbackRate.value = opts.rate ?? 1;
  const g = ac.createGain();
  g.gain.value = opts.vol ?? 1;
  src.connect(g).connect(opts.bus ?? sfxBus);
  src.start(opts.when ?? ac.currentTime);
  return src;
}

window.addEventListener("keydown", unlock);
window.addEventListener("mousedown", unlock);
window.addEventListener("touchstart", unlock);

export function applyVolume() {
  if (!ac) return;
  sfxBus.gain.value = volume.sfx;
  musicBus.gain.value = volume.music * 0.5;
}

type Wave = OscillatorType;
function tone(bus: GainNode, type: Wave, f0: number, f1: number, t0: number, dur: number, vol: number, attack = 0.003) {
  if (!ac) return;
  const o = ac.createOscillator();
  const g = ac.createGain();
  o.type = type;
  o.frequency.setValueAtTime(f0, t0);
  if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t0 + dur);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.linearRampToValueAtTime(vol, t0 + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.connect(g).connect(bus);
  o.start(t0);
  o.stop(t0 + dur + 0.02);
}

function noise(bus: GainNode, t0: number, dur: number, vol: number, filter: BiquadFilterType, f0: number, f1 = f0, q = 1) {
  if (!ac) return;
  const s = ac.createBufferSource();
  s.buffer = noiseBuf;
  s.loop = true;
  const f = ac.createBiquadFilter();
  f.type = filter;
  f.Q.value = q;
  f.frequency.setValueAtTime(f0, t0);
  if (f1 !== f0) f.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t0 + dur);
  const g = ac.createGain();
  g.gain.setValueAtTime(vol, t0);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  s.connect(f).connect(g).connect(bus);
  s.start(t0, Math.random() * 0.5);
  s.stop(t0 + dur + 0.02);
}

export type Sfx =
  | "shot" | "laser" | "missile" | "hit" | "pop" | "boom" | "bigboom" | "pickup" | "medal" | "drop"
  | "loot" | "draft" | "bomb" | "warning" | "hurt" | "shield" | "select" | "move" | "cue" | "deny" | "launch"
  | "confirm" | "equip" | "scrap" | "bombup" | "blast";

/** Which sound effects come from samples; anything missing falls back to the synth. */
function sampled(name: Sfx, p: number, t: number): boolean {
  switch (name) {
    case "pop": return !!play("pop", { vol: 0.55, rate: 0.9 + Math.random() * 0.25 });
    case "boom": return !!play("boom", { vol: 0.8 });
    case "bigboom": return !!play("bigboom", { vol: 1 });
    case "blast": return !!play("blast", { vol: 0.35, rate: 1 + Math.random() * 0.3 });
    case "pickup": return !!play("pickup", { vol: 0.7 });
    case "bombup": return !!play("bombup", { vol: 0.7 });
    case "draft": return !!play("draft", { vol: 0.8 });
    case "medal": return !!play("medal", { vol: 0.5, rate: 1 + Math.min(p, 24) * 0.035 });
    case "loot": {
      const ok = !!play(p >= 2 ? "lootrare" : "loot", { vol: p >= 2 ? 0.9 : 0.6, rate: p === 1 ? 1.15 : 1 });
      if (p >= 3) play("lootrare", { vol: 0.7, rate: 1.5, when: t + 0.12 });
      return ok;
    }
    case "hurt": return !!play("hurt", { vol: 0.9 });
    case "shield": return !!play("shield", { vol: 0.8 });
    case "select": return !!play("select", { vol: 0.5 });
    case "move": return !!play("move", { vol: 0.35 });
    case "deny": return !!play("deny", { vol: 0.6 });
    case "confirm": return !!play("confirm", { vol: 0.7 });
    case "equip": return !!play("equip", { vol: 0.7 });
    case "scrap": return !!play("scrap", { vol: 0.6 });
    case "warning": {
      const ok = !!play("alarm", { vol: 0.7 });
      if (ok) for (let i = 1; i < 3; i++) play("alarm", { vol: 0.7, when: t + i * 0.9 });
      return ok;
    }
    case "bomb": {
      const ok = !!play("whoosh", { vol: 0.9, rate: 0.7 });
      if (ok) { play("bigboom", { vol: 1, rate: 0.8, when: t + 0.62 }); tone(sfxBus, "sine", 70, 25, t + 0.6, 1.5, 0.6); }
      return ok;
    }
    default: return false;
  }
}

const last = new Map<string, number>();
/** Play a sound effect. `p` is an optional parameter (medal chain, loot rarity). */
export function sfx(name: Sfx, p = 0) {
  if (!ac) return;
  const t = ac.currentTime;
  const gap = { shot: 0.07, laser: 0.09, hit: 0.04, pop: 0.04, missile: 0.08, blast: 0.06, medal: 0.03, boom: 0.05 }[name as string] ?? 0;
  if (gap && t - (last.get(name) ?? 0) < gap) return;
  last.set(name, t);
  if (sampled(name, p, t)) return;
  const B = sfxBus;
  switch (name) {
    case "shot": tone(B, "square", 1400, 700, t, 0.04, 0.035); break;
    case "laser": tone(B, "sawtooth", 2200, 1800, t, 0.05, 0.025); break;
    case "missile": noise(B, t, 0.12, 0.06, "bandpass", 2500, 800, 2); break;
    case "hit": noise(B, t, 0.03, 0.05, "highpass", 3000); break;
    case "pop": noise(B, t, 0.18, 0.18, "lowpass", 3000, 300); tone(B, "square", 300, 60, t, 0.12, 0.06); break;
    case "boom": noise(B, t, 0.45, 0.35, "lowpass", 2500, 120); tone(B, "triangle", 160, 40, t, 0.35, 0.3); break;
    case "bigboom":
      noise(B, t, 1.4, 0.5, "lowpass", 1800, 60); tone(B, "sine", 90, 30, t, 1.2, 0.6);
      noise(B, t + 0.2, 1.0, 0.3, "lowpass", 1200, 80); break;
    case "pickup": [0, 4, 7, 12].forEach((n, i) => tone(B, "square", 523 * 2 ** (n / 12), 523 * 2 ** (n / 12), t + i * 0.04, 0.08, 0.08)); break;
    case "medal": { const f = 880 * 2 ** (Math.min(p, 20) / 24); tone(B, "square", f, f, t, 0.06, 0.07); tone(B, "square", f * 1.5, f * 1.5, t + 0.05, 0.1, 0.06); break; }
    case "drop": tone(B, "triangle", 600, 150, t, 0.25, 0.12); break;
    case "loot": { const base = [440, 554, 659, 880][p] ?? 440; [0, 7, 12, 19, 24].slice(0, 2 + p).forEach((n, i) => tone(B, p >= 2 ? "sawtooth" : "square", base * 2 ** (n / 12), base * 2 ** (n / 12), t + i * 0.06, 0.2, 0.06)); break; }
    case "draft": [0, 4, 7].forEach((n) => tone(B, "square", 660 * 2 ** (n / 12), 660 * 2 ** (n / 12), t, 0.25, 0.06)); tone(B, "square", 1320, 1320, t + 0.12, 0.2, 0.06); break;
    case "bomb": noise(B, t, 0.6, 0.3, "bandpass", 300, 4000, 1); noise(B, t + 0.5, 1.6, 0.6, "lowpass", 2000, 50); tone(B, "sine", 70, 25, t + 0.5, 1.5, 0.7); break;
    case "warning": for (let i = 0; i < 4; i++) { tone(B, "square", 440, 440, t + i * 0.5, 0.24, 0.1); tone(B, "square", 330, 330, t + i * 0.5 + 0.25, 0.24, 0.1); } break;
    case "hurt": tone(B, "square", 600, 80, t, 0.4, 0.15); noise(B, t, 0.4, 0.3, "lowpass", 2000, 200); break;
    case "shield": tone(B, "triangle", 1800, 300, t, 0.3, 0.15); noise(B, t, 0.25, 0.15, "highpass", 5000); break;
    case "select": tone(B, "square", 880, 880, t, 0.05, 0.06); tone(B, "square", 1320, 1320, t + 0.05, 0.08, 0.06); break;
    case "move": tone(B, "square", 660, 660, t, 0.03, 0.04); break;
    case "cue": tone(B, "square", 1200, 1200, t, 0.06, 0.07); tone(B, "square", 1200, 1200, t + 0.12, 0.06, 0.07); break;
    case "deny": tone(B, "square", 200, 150, t, 0.15, 0.08); break;
    case "launch": noise(B, t, 2.2, 0.25, "bandpass", 200, 3000, 0.7); tone(B, "sawtooth", 80, 400, t, 2.0, 0.05, 0.8); play("whoosh", { vol: 0.6, rate: 0.6, when: t + 0.3 }); break;
    case "confirm": case "equip": tone(B, "square", 880, 880, t, 0.05, 0.06); tone(B, "square", 1320, 1320, t + 0.05, 0.08, 0.06); break;
    case "scrap": noise(B, t, 0.2, 0.2, "bandpass", 1200, 600, 3); break;
    case "bombup": [0, 4, 7, 12].forEach((n, i) => tone(B, "triangle", 392 * 2 ** (n / 12), 392 * 2 ** (n / 12), t + i * 0.04, 0.08, 0.1)); break;
    case "blast": noise(B, t, 0.15, 0.1, "lowpass", 2000, 300); break;
  }
}

// ---------------------------------------------------------------- music

/** A song: bpm, chords per bar (root midi + quality), lead notes [step, midi, len], and drum pattern flags. */
interface Song {
  bpm: number;
  bars: [number, "m" | "M" | "7"][];
  lead: [number, number, number][];
  drums: boolean;
  bassPattern: number[];
  leadWave: Wave;
}
const n = (s: string) => {
  const m = /([a-g])(#?)(\d)/.exec(s)!;
  return 12 * (+m[3] + 1) + { c: 0, d: 2, e: 4, f: 5, g: 7, a: 9, b: 11 }[m[1] as "c"]! + (m[2] ? 1 : 0);
};
const L = (spec: string) =>
  spec.trim().split(/\s+/).map((tok) => {
    const [s, note, len] = tok.split(":");
    return [+s, n(note), +len] as [number, number, number];
  });

export const SONGS: Record<string, Song> = {
  stage: {
    bpm: 148, drums: true, leadWave: "square", bassPattern: [0, 0, 12, 0, 0, 12, 0, 12],
    bars: [[n("a2"), "m"], [n("f2"), "M"], [n("c3"), "M"], [n("g2"), "M"], [n("a2"), "m"], [n("f2"), "M"], [n("c3"), "M"], [n("e2"), "7"]],
    lead: L(`0:e5:4 4:a5:2 6:b5:2 8:c6:6 14:b5:2 16:a5:4 20:f5:2 22:a5:2 24:c6:4 28:d6:4 32:e6:6 38:d6:2 40:c6:4 44:g5:4
      48:b5:4 52:a5:2 54:g5:2 56:b5:8 64:a5:2 66:c6:2 68:e6:4 72:d6:2 74:c6:2 76:b5:4 80:c6:4 84:a5:4 88:f5:4 92:a5:4
      96:g5:2 98:c6:2 100:e6:4 104:g6:4 108:e6:4 112:d6:4 116:b5:4 120:g#5:8`),
  },
  boss: {
    bpm: 168, drums: true, leadWave: "sawtooth", bassPattern: [0, 0, 0, 0, 12, 0, 0, 0],
    bars: [[n("d2"), "m"], [n("d2"), "m"], [n("a#1"), "M"], [n("a1"), "7"]],
    lead: L(`0:d5:2 3:d5:1 4:f5:2 6:d5:2 8:a5:4 12:g#5:4 16:d5:2 19:d5:1 20:f5:2 22:g5:2 24:a5:2 26:c6:2 28:a#5:4
      32:a#5:6 38:a5:2 40:f5:4 44:d5:4 48:c#5:4 52:e5:4 56:a5:4 60:c#6:4`),
  },
  hangar: {
    bpm: 96, drums: false, leadWave: "triangle", bassPattern: [0, -1, -1, -1, 7, -1, -1, -1],
    bars: [[n("c3"), "M"], [n("g2"), "M"], [n("a2"), "m"], [n("f2"), "M"]],
    lead: L(`0:e5:6 6:d5:2 8:c5:8 16:d5:6 22:b4:2 24:g4:8 32:c5:4 36:e5:4 40:a5:8 48:g5:4 52:f5:4 56:e5:8`),
  },
};

let song: Song | null = null;
let pendingSong: string | null = null;
let step = 0;
let nextTime = 0;
let timer = 0;

let current: string | null = null;

/**
 * Recorded music. Each song resolves to the first file found: a local-only override in
 * public/music-local/ (gitignored, never deployed, for reference tracks), then a shipped
 * track in public/music/, then the built-in synth.
 */
const SONG_FILES = ["stage", "boss", "hangar"];
const trackUrl = new Map<string, string>();
async function probe(url: string) {
  try {
    const r = await fetch(url, { method: "HEAD" });
    return r.ok && (r.headers.get("content-type") ?? "").includes("audio");
  } catch {
    return false;
  }
}
const trackData = new Map<string, Promise<ArrayBuffer | null>>();
const trackBuf = new Map<string, Promise<AudioBuffer | null>>();

/** Find each song's file and start downloading it; decoding waits until audio is unlocked. */
export function preloadMusic(): Promise<void> {
  return Promise.all(SONG_FILES.map(async (n) => {
    for (const dir of ["music-local", "music"]) {
      if (await probe(`${dir}/${n}.mp3`)) {
        trackUrl.set(n, `${dir}/${n}.mp3`);
        trackData.set(n, fetch(`${dir}/${n}.mp3`).then((r) => r.arrayBuffer()).catch(() => null));
        return;
      }
    }
  })).then(() => { if (ac) for (const n of trackUrl.keys()) decodeTrack(n); });
}

/**
 * Tracks are decoded into AudioBuffers and played through the unlocked AudioContext, like the
 * sound effects. (An <audio> element started outside a user gesture can be silently blocked.)
 */
function decodeTrack(name: string): Promise<AudioBuffer | null> {
  let p = trackBuf.get(name);
  if (!p && ac) {
    const ctx = ac;
    p = (trackData.get(name) ?? Promise.resolve(null)).then((d) => (d ? ctx.decodeAudioData(d) : null)).catch(() => null);
    trackBuf.set(name, p);
  }
  return p ?? Promise.resolve(null);
}

let local: { src: AudioBufferSourceNode; gain: GainNode } | null = null;
let musicToken = 0;

function stopLocal() {
  musicToken++;
  if (!local || !ac) return;
  const { src, gain } = local;
  gain.gain.setTargetAtTime(0, ac.currentTime, 0.15);
  src.stop(ac.currentTime + 0.8);
  local = null;
}

function startLocal(name: string) {
  const token = ++musicToken;
  void decodeTrack(name).then((buf) => {
    // Bail if the song changed while decoding.
    if (!buf || !ac || token !== musicToken) return;
    const src = ac.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    const gain = ac.createGain();
    gain.gain.value = 0.55; // Mastered tracks run much hotter than the synth.
    src.connect(gain).connect(musicBus);
    src.start();
    local = { src, gain };
  });
}

/** Diagnostics: which song is current and whether a recorded track is playing. */
export const musicState = () => ({ current, recorded: !!local, tracks: [...trackUrl.entries()] });

export function playSong(name: string | null) {
  pendingSong = name;
  if (!ac) return;
  if (name === current) return;
  current = name;
  stopLocal();
  clearInterval(timer);
  song = null;
  if (name && trackUrl.has(name)) return startLocal(name);
  const s = name ? SONGS[name] : null;
  song = s;
  step = 0;
  nextTime = ac.currentTime + 0.1;
  if (s) timer = window.setInterval(schedule, 25);
}

const freq = (m: number) => 440 * 2 ** ((m - 69) / 12);

function schedule() {
  if (!ac || !song) return;
  const dt = 60 / song.bpm / 4;
  const barCount = song.bars.length;
  while (nextTime < ac.currentTime + 0.12) {
    const s = step % (barCount * 16);
    const [root, q] = song.bars[Math.floor(s / 16)];
    const chord = q === "m" ? [0, 3, 7] : q === "7" ? [0, 4, 7, 10] : [0, 4, 7];
    const M = musicBus;
    // Bass on eighths.
    if (s % 2 === 0) {
      const off = song.bassPattern[(s / 2) % song.bassPattern.length];
      if (off >= 0) tone(M, "triangle", freq(root + off), freq(root + off), nextTime, dt * 1.8, 0.35);
    }
    // Quiet arpeggio.
    const arp = root + 24 + chord[s % chord.length];
    tone(M, "square", freq(arp), freq(arp), nextTime, dt * 0.9, song.drums ? 0.035 : 0.05);
    // Lead.
    const leadLen = song.lead.length ? Math.max(...song.lead.map(([st]) => st)) + 16 : 64;
    const ls = s % (Math.ceil(leadLen / 64) * 64);
    for (const [st, note, len] of song.lead) if (st === ls) {
      tone(M, song.leadWave, freq(note), freq(note), nextTime, dt * len * 0.95, song.leadWave === "sawtooth" ? 0.07 : 0.1, 0.01);
      tone(M, song.leadWave, freq(note) * 1.005, freq(note) * 1.005, nextTime + dt * 0.5, dt * len * 0.8, 0.03, 0.01);
    }
    if (song.drums) {
      if (s % 8 === 0) tone(M, "sine", 150, 40, nextTime, 0.15, 0.6);
      if (s % 8 === 4) noise(M, nextTime, 0.12, 0.25, "bandpass", 1800, 1200, 0.8);
      if (s % 2 === 0) noise(M, nextTime, 0.03, 0.08, "highpass", 7000);
    }
    nextTime += dt;
    step++;
  }
}
