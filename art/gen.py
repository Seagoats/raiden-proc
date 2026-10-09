#!/usr/bin/env python3
"""Generate raw art through Codex's image tool. Usage: gen.py [name ...] (default: all missing)."""
import json, subprocess, sys, os
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

ROOT = Path(__file__).resolve().parent
RAW = ROOT / "raw"
CODEX = "/Applications/ChatGPT.app/Contents/Resources/codex-cli/bin/codex"
spec = json.loads((ROOT / "assets.json").read_text())
names = sys.argv[1:]
force = bool(names)
todo = [a for a in spec["assets"] if (a["name"] in names if names else not (RAW / f"{a['name']}.png").exists())]

def run(a):
    out = RAW / f"{a['name']}.png"
    prompt = (
        f"Use your image generation tool to create ONE image at size {a['size']}. "
        f"Subject: {a['prompt']} Style: {spec['style']} "
        + (spec["keyed"] if a.get("keyed") else "")
        + f" After it is generated, copy the resulting PNG file to {out} (overwrite if it exists) and print its path. Do nothing else."
    )
    args = [CODEX, "exec", "--skip-git-repo-check", "-s", "workspace-write", "-c", "model_reasoning_effort=low"]
    if a.get("ref"):
        args += ["-i", str(RAW / f"{a['ref']}.png")]
        prompt = ("The attached image is the first strip of the same stage: match its exact color palette, pixel density, lighting and art style, "
                  "but draw NEW content as described. Do not copy its layout. " + prompt)
    r = subprocess.run(args + ["-"], input=prompt,
                       cwd=RAW, capture_output=True, text=True, timeout=900)
    ok = out.exists()
    print(("OK  " if ok else "FAIL"), a["name"], flush=True)
    if not ok: print(r.stdout[-1500:], r.stderr[-800:], flush=True)

RAW.mkdir(exist_ok=True)
first = [a for a in todo if not a.get("ref")]
rest = [a for a in todo if a.get("ref")]
with ThreadPoolExecutor(4) as ex:
    list(ex.map(run, first))
with ThreadPoolExecutor(4) as ex:
    list(ex.map(run, rest))
