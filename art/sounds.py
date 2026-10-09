#!/usr/bin/env python3
"""Build public/sfx/*.mp3 from the free sound packs (kept out of the repo).

Usage: python3 art/sounds.py <400 Sounds Pack.zip> <Super Dialogue Audio Pack v1.zip> <Essentials_Series_NOX_SOUND.zip>

Every clip is altered for the SNES feel: mono, 32 kHz, low-passed, trimmed and
peak-normalised. Ops voice lines get a radio band-pass and bit crunch; ambience
loops are crossfaded so they loop seamlessly. Licences: see CREDITS.md.
"""
import re
import subprocess
import sys
from pathlib import Path

OUT = Path(__file__).resolve().parent.parent / "public" / "sfx"
OUT.mkdir(parents=True, exist_ok=True)
P400, DIALOGUE, NOX = sys.argv[1:4]

D = "Super Dialogue Audio Pack v1/Step 2 - Audio Files/"
MEG = lambda cat, n: f"{D}{cat}/Female/Meghan Christian/{cat.split(' - ')[1].lower()}_{n}_meghan.wav"
SEAN = lambda cat, n: f"{D}{cat}/Male/Sean Lenhart/{cat.split(' - ')[1].lower()}_{n}_sean.wav"
NOXP = "Essentials_Series_NOX_SOUND/"

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
    "jingle_start": (P400, "Musical Effects/8_bit_level_start.wav", "sfx"),
    "jingle_clear": (P400, "Musical Effects/8_bit_level_complete.wav", "sfx"),
    "jingle_fail": (P400, "Musical Effects/8_bit_defeated.wav", "sfx"),
    # Super Dialogue Audio Pack (Dillon Becker, CC BY 4.0): Meghan as carrier ops on the radio.
    "v_getready": (DIALOGUE, MEG("6 - Miscellaneous", 8), "radio"),
    "v_letsgo": (DIALOGUE, MEG("2 - Confirmation", 7), "radio"),
    "v_yougotit": (DIALOGUE, MEG("2 - Confirmation", 4), "radio"),
    "v_enemy": (DIALOGUE, MEG("6 - Miscellaneous", 7), "radio"),
    "v_attack": (DIALOGUE, MEG("6 - Miscellaneous", 6), "radio"),
    "v_lowhp": (DIALOGUE, MEG("6 - Miscellaneous", 5), "radio"),
    "v_complete": (DIALOGUE, MEG("1 - Completion", 8), "radio"),
    "v_gameover": (DIALOGUE, MEG("6 - Miscellaneous", 1), "radio"),
    "v_highscore": (DIALOGUE, MEG("6 - Miscellaneous", 11), "radio"),
    "v_negative": (DIALOGUE, MEG("5 - Refusal", 6), "radio"),
    "v_welcome": (DIALOGUE, MEG("3 - Greeting", 6), "radio"),
    # Sean as the pilot.
    "p_woo": (DIALOGUE, SEAN("6 - Miscellaneous", 4), "voice"),
    "p_hit1": (DIALOGUE, SEAN("7 - Damage", 1), "voice"),
    "p_hit2": (DIALOGUE, SEAN("7 - Damage", 3), "voice"),
    "p_hit3": (DIALOGUE, SEAN("7 - Damage", 5), "voice"),
    "p_death": (DIALOGUE, SEAN("8 - Death", 2), "voice"),
    # NOX Sound Essentials (CC0) ambience.
    "amb_sea": (NOX, NOXP + "Nature_Essentials_NOX_SOUND/Ambiance_Sea_Loop_Stereo.wav", "amb"),
    "amb_hangar": (NOX, NOXP + "Sample_A_Sound_Effect/Atmosphere_Scifi_Bunker_Loop_Stereo.wav", "amb"),
}

TRIM = "silenceremove=start_periods=1:start_threshold=-55dB,areverse,silenceremove=start_periods=1:start_threshold=-55dB,areverse"
CHAINS = {
    "sfx": f"aformat=channel_layouts=mono,{TRIM},lowpass=f=11500,aresample=32000",
    "voice": f"aformat=channel_layouts=mono,{TRIM},highpass=f=120,lowpass=f=9000,aresample=32000",
    "radio": f"aformat=channel_layouts=mono,{TRIM},highpass=f=320,lowpass=f=3400,acompressor=threshold=-20dB:ratio=6:makeup=6,"
             "acrusher=bits=10:mode=log:aa=1:mix=0.35,aresample=32000",
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
    if kind == "amb":
        # Seamless loop: the stretch after the loop end is faded onto its start, so the seam is inaudible.
        probe = subprocess.run(["ffmpeg", "-hide_banner", "-i", "pipe:0", "-f", "null", "-"], input=data, capture_output=True)
        h, m, sec = re.findall(r"time=(\d+):(\d+):([\d.]+)", probe.stderr.decode())[-1]
        dur = int(h) * 3600 + int(m) * 60 + float(sec)
        cf = min(3.0, dur * 0.15)
        end = min(dur - cf, 27.0)
        fc = ("[0]aformat=channel_layouts=mono,aresample=22050,lowpass=f=8000,asplit[a][b];"
              f"[a]atrim={cf}:{end},asetpts=PTS-STARTPTS,afade=t=in:d={cf}[body];"
              f"[b]atrim={end}:{end + cf},asetpts=PTS-STARTPTS,afade=t=out:d={cf}[tail];"
              "[body][tail]amix=inputs=2:duration=first:normalize=0,volume=0.9")
        ffmpeg(data, ["-filter_complex", fc, "-c:a", "libmp3lame", "-b:a", "48k", "-y", str(out)])
    else:
        chain = CHAINS[kind]
        g = peak_gain(data, chain)
        ffmpeg(data, ["-af", f"{chain},volume={g:.2f}dB", "-c:a", "libmp3lame", "-b:a", "64k", "-y", str(out)])
    print(f"{name:14s} {out.stat().st_size // 1024:4d} KB  <- {Path(path).name}")
