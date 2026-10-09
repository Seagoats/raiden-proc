#!/usr/bin/env python3
"""Build public/sfx/*.mp3 from the free sound packs (kept out of the repo).

Usage: python3 art/sounds.py <400 Sounds Pack.zip>

Every clip is altered for the SNES feel: mono, 32 kHz, low-passed, trimmed and
peak-normalised. Licence: see CREDITS.md.
"""
import re
import subprocess
import sys
from pathlib import Path

OUT = Path(__file__).resolve().parent.parent / "public" / "sfx"
OUT.mkdir(parents=True, exist_ok=True)
P400 = sys.argv[1]


# name: (zip, member, kind)
CLIPS = {
    # 400 Sounds Pack (Chequered Ink)
    "pop": (P400, "Retro/explosion_small.wav", "sfx"),
    "boom": (P400, "Retro/explosion_medium.wav", "sfx"),
    "bigboom": (P400, "Retro/explosion_large.wav", "sfx"),
    "blast": (P400, "Retro/explosion_quick.wav", "sfx"),
    "pickup": (P400, "Retro/power_up.wav", "sfx"),
    "bombup": (P400, "Retro/power_up_2.wav", "sfx"),
    "draft": (P400, "Weapons/weapon_upgrade.wav", "sfx"),
    "medal": (P400, "Retro/coin.wav", "sfx"),
    "loot": (P400, "Items/gem_collect.wav", "sfx"),
    "lootrare": (P400, "Musical Effects/8_bit_chime_positive.wav", "sfx"),
    "hurt": (P400, "Retro/hurt.wav", "sfx"),
    "shield": (P400, "Retro/power_down.wav", "sfx"),
    "select": (P400, "UI/sci_fi_select.wav", "sfx"),
    "move": (P400, "UI/sci_fi_hover.wav", "sfx"),
    "deny": (P400, "UI/sci_fi_disallow.wav", "sfx"),
    "confirm": (P400, "UI/sci_fi_select_big.wav", "sfx"),
    "equip": (P400, "Items/item_equip.wav", "sfx"),
    "scrap": (P400, "Materials/metal_clang.wav", "sfx"),
    "alarm": (P400, "UI/synth_warning.wav", "sfx"),
    "whoosh": (P400, "Other/whoosh_1.wav", "sfx"),
}

TRIM = "silenceremove=start_periods=1:start_threshold=-55dB,areverse,silenceremove=start_periods=1:start_threshold=-55dB,areverse"
CHAINS = {
    "sfx": f"aformat=channel_layouts=mono,{TRIM},lowpass=f=11500,aresample=32000",
}


def member(zip_path, name):
    return subprocess.run(["unzip", "-p", zip_path, name], capture_output=True, check=True).stdout


def ffmpeg(data, args):
    return subprocess.run(["ffmpeg", "-hide_banner", "-loglevel", "error", "-i", "pipe:0", *args], input=data, capture_output=True, check=True)


def peak_gain(data, chain):
    r = subprocess.run(["ffmpeg", "-hide_banner", "-i", "pipe:0", "-af", chain + ",volumedetect", "-f", "null", "-"], input=data, capture_output=True)
    m = re.search(r"max_volume: (-?[\d.]+) dB", r.stderr.decode())
    return -1.0 - float(m.group(1)) if m else 0.0


for name, (zp, path, kind) in CLIPS.items():
    data = member(zp, path)
    out = OUT / f"{name}.mp3"
    chain = CHAINS[kind]
    g = peak_gain(data, chain)
    ffmpeg(data, ["-af", f"{chain},volume={g:.2f}dB", "-c:a", "libmp3lame", "-b:a", "64k", "-y", str(out)])
    print(f"{name:14s} {out.stat().st_size // 1024:4d} KB  <- {Path(path).name}")
