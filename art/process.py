#!/usr/bin/env python3
"""Turn raw Codex renders (art/raw) into game-ready SNES-style sprites (public/assets).

Steps per asset: key out the magenta background, crop, area-downscale to the
target game size, binarise alpha, quantise to a small palette, snap colours to
15-bit (SNES BGR555). Sprite sheets are split into connected components.
"""
from pathlib import Path
from PIL import Image, ImageFilter
import numpy as np
from scipy import ndimage

ROOT = Path(__file__).resolve().parent
RAW = ROOT / "raw"
OUT = ROOT.parent / "public" / "assets"
OUT.mkdir(parents=True, exist_ok=True)

def key(im):
    a = np.array(im.convert("RGBA")).astype(np.int16)
    r, g, b = a[..., 0], a[..., 1], a[..., 2]
    m = np.minimum(r, b) - g
    bg = (m > 70) & (r > 140) & (b > 140)
    # Pink fringe left by anti-aliasing against magenta.
    fringe = (m > 40) & (np.abs(r - b) < 60) & ~bg
    a[..., 3] = np.where(bg | fringe, 0, 255)
    return Image.fromarray(a.astype(np.uint8), "RGBA")

def snap555(arr):
    return (np.round(arr / 255 * 31) * 255 / 31).astype(np.uint8)

def finish(im, colors=48, sharpen=True):
    """Binarise alpha, quantise, snap to 15-bit."""
    return _finish(im, colors, sharpen)

def _finish(im, colors, sharpen):
    """Binarise alpha, quantise, snap to 15-bit."""
    if sharpen:
        rgb = im.convert("RGB").filter(ImageFilter.UnsharpMask(radius=1, percent=60, threshold=2))
        im = Image.merge("RGBA", (*rgb.split(), im.split()[3]))
    a = np.array(im)
    alpha = a[..., 3] >= 140
    q = im.convert("RGB").quantize(colors=colors, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.NONE).convert("RGB")
    rgb = snap555(np.array(q).astype(np.float32))
    out = np.dstack([rgb, np.where(alpha, 255, 0).astype(np.uint8)])
    return Image.fromarray(out, "RGBA")

def scale_to(im, width=None, height=None):
    w, h = im.size
    if width and not height: height = max(1, round(h * width / w))
    if height and not width: width = max(1, round(w * height / h))
    return im.resize((width, height), Image.Resampling.LANCZOS)

def crop(im):
    bbox = im.split()[3].getbbox()
    return im.crop(bbox) if bbox else im

def sprite(name, width, colors=48, out=None, rotate=0):
    im = crop(key(Image.open(RAW / f"{name}.png")))
    if rotate: im = im.rotate(rotate, expand=True)
    im = finish(scale_to(im, width), colors)
    im.save(OUT / f"{out or name}.png")
    print(f"{out or name}: {im.size}")

def components(name, width_of_each, min_area=2000, colors=40, order="rows", out=None, sharpen=True):
    """Split a keyed sheet into its separate blobs, ordered row-major."""
    im = key(Image.open(RAW / f"{name}.png"))
    alpha = np.array(im)[..., 3] > 0
    # Close small gaps so a blob's detached sparks stay with it.
    lab, n = ndimage.label(ndimage.binary_dilation(alpha, iterations=12))
    boxes = [s for s in ndimage.find_objects(lab) if s is not None]
    boxes = [s for s in boxes if (s[0].stop - s[0].start) * (s[1].stop - s[1].start) >= min_area]
    rows = sorted(boxes, key=lambda s: s[0].start)
    # Group into rows by vertical centre.
    grouped, cur, last = [], [], None
    for s in rows:
        c = (s[0].start + s[0].stop) / 2
        if last is not None and abs(c - last) > 140:
            grouped.append(cur); cur = []
        cur.append(s); last = c
    grouped.append(cur)
    ordered = [s for g in grouped for s in sorted(g, key=lambda s: s[1].start)]
    sizes = []
    for i, s in enumerate(ordered):
        part = im.crop((s[1].start, s[0].start, s[1].stop, s[0].stop))
        part = crop(part)
        w = width_of_each(i, part) if callable(width_of_each) else width_of_each
        if isinstance(w, tuple):
            part = finish(part.resize(w, Image.Resampling.BOX if not sharpen else Image.Resampling.LANCZOS), colors, sharpen)
        else:
            part = finish(scale_to(part, w), colors, sharpen)
        part.save(OUT / f"{out or name}_{i}.png")
        sizes.append(part.size)
    print(f"{out or name}: {len(ordered)} parts {sizes}")

def grid(name, cols, rows, size, colors=32):
    """Split an evenly laid out sheet into cols x rows cells, each fitted into size x size."""
    im = key(Image.open(RAW / f"{name}.png"))
    cw, ch = im.width / cols, im.height / rows
    for r in range(rows):
        for c in range(cols):
            cell = crop(im.crop((round(c * cw), round(r * ch), round((c + 1) * cw), round((r + 1) * ch))))
            s = size / max(256, cell.width, cell.height)
            cell = finish(cell.resize((max(1, round(cell.width * s)), max(1, round(cell.height * s))), Image.Resampling.LANCZOS), colors)
            cell.save(OUT / f"{name}_{r * cols + c}.png")
    print(f"{name}: {cols * rows} cells")

def backdrop(name, w, h, colors=64, darken=1.0):
    im = Image.open(RAW / f"{name}.png").convert("RGB")
    sw, sh = im.size
    s = max(w / sw, h / sh)
    im = im.resize((round(sw * s), round(sh * s)), Image.Resampling.LANCZOS)
    x, y = (im.width - w) // 2, (im.height - h) // 2
    im = im.crop((x, y, x + w, y + h))
    if darken != 1.0:
        im = Image.eval(im, lambda v: int(v * darken))
    im = im.convert("RGBA")
    finish(im, colors, sharpen=False).save(OUT / f"{name}.png")
    print(f"{name}: {(w, h)}")

if __name__ == "__main__":
    sprite("carrier", 150, 40)
    sprite("island_a", 150)
    sprite("island_b", 130)
    sprite("island_c", 300, 56)
    sprite("reef", 170)
    sprite("boss_gunship", 190, 56)
    sprite("gunboat", 34, 24)
    sprite("destroyer", 56, 32)
    components("clouds", lambda i, p: max(48, round(p.width * 0.28)), colors=16)
    grid("explosion", 4, 2, 44, colors=24)
    components("icons", 24, colors=32)
    components("turrets", 22, colors=24)
    # Hull width sets the class read; tall needle hulls are squashed vertically to stay compact.
    hull_w, hull_h = [10, 16, 22], [46, 46, 48]
    components("player_hulls", lambda i, p: (hull_w[i], hull_h[i]), colors=14, out="phull", sharpen=False)
    components("player_wings", lambda i, p: [46, 46, 60][i], colors=14, out="pwing", sharpen=False)
    eng_w = [12, 20, 32]
    components("player_engines", lambda i, p: (eng_w[i], round(p.height * eng_w[i] / p.width * 0.75)), colors=14, out="pengine", sharpen=False)
    for k in range(1, 8):
        backdrop(f"bg_{k:02d}", 288, 432, 96)
    backdrop("title_art", 288, 384, 64)
    backdrop("hangar_bg", 288, 384, 48, darken=0.55)
