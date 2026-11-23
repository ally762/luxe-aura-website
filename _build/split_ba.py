"""Splits the side-by-side before|after photos used on the homepage into separate
before / after images for the drag slider (assets/img/ba). Run after optimize_images.py.
Usage: python _build/split_ba.py"""
import glob
import os

from PIL import Image, ImageStat

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
OUT = os.path.join(ROOT, 'assets', 'img', 'ba')
os.makedirs(OUT, exist_ok=True)
SRC = {
    'chemo': 'hair-extensions-for-after-chemo-024325',
    'curly': 'hair-extensions-for-curly-hair-e56126',
    'alopecia': 'hair-extensions-for-alopecia-229a24',
    'short': 'hair-extensions-for-short-hair-86aa9b',
    'thin': 'hair-extensions-for-thin-hair-5ad507',
    'damaged': 'hair-extensions-for-damaged-hair-3643c7',
}
for key, sid in SRC.items():
    files = glob.glob(os.path.join(ROOT, 'assets', 'img', 'c', f'{sid}-*.webp'))
    f = max(files, key=lambda p: int(p.rsplit('-', 1)[1].split('.')[0]))
    im = Image.open(f).convert('RGB')
    w, h = im.size
    g = im.convert('L')
    best = None
    for x in range(int(w * .38), int(w * .62)):
        st = ImageStat.Stat(g.crop((x, 0, x + 1, h)))
        score = st.mean[0] - st.stddev[0] * 0.5
        if best is None or score > best[0]:
            best = (score, x)
    x = best[1]
    gap = max(2, w // 160)
    L, R = im.crop((0, 0, x - gap, h)), im.crop((x + gap + 1, 0, w, h))
    tw = min(L.width, R.width)
    L, R = L.crop((0, 0, tw, h)), R.crop((R.width - tw, 0, R.width, h))
    if tw > 900:  # slider is at most ~470px wide (x2 for retina)
        nh = round(h * 900 / tw)
        L, R, tw, h = L.resize((900, nh), Image.LANCZOS), R.resize((900, nh), Image.LANCZOS), 900, nh
    L.save(os.path.join(OUT, f'{key}-before.webp'), quality=86, method=6)
    R.save(os.path.join(OUT, f'{key}-after.webp'), quality=86, method=6)
    print(f'{key}: {w}x{h} split at {x} -> {tw}x{h} each')
