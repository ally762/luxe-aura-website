"""Converts downloaded images to responsive, high-quality WebP files in assets/img/c and writes
_build/data/images.json ({source url: {id, w, h, widths}}).

Low-resolution originals are first enlarged with the EDSR super-resolution network
(OpenCV dnn_superres; models in _build/cache/models) so they stay sharp on large/retina screens.
Usage: python _build/optimize_images.py
"""
import json
import os
import sys
import time

import cv2
import numpy as np
from PIL import Image, ImageFilter, ImageOps

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
OUT = os.path.join(ROOT, 'assets', 'img', 'c')
SR_CACHE = os.path.join(HERE, 'cache', 'sr')
MODELS = os.path.join(HERE, 'cache', 'models')
WIDTHS = [480, 960, 1440, 2000]
TARGET = 1600      # enlarge anything narrower than this
QUALITY = 86
os.makedirs(OUT, exist_ok=True)
os.makedirs(SR_CACHE, exist_ok=True)

_sr = {}


# EDSR (slow, best) for the key before/after photos; FSRCNN (fast) for everything else
PRIORITY = ('hair-extensions-for-', 'wig-fittings')


def superres(rgb, scale, model):
    key = (model, scale)
    if key not in _sr:
        m = cv2.dnn_superres.DnnSuperResImpl_create()
        m.readModel(os.path.join(MODELS, f'{model.upper()}_x{scale}.pb'))
        m.setModel(model, scale)
        _sr[key] = m
    bgr = cv2.cvtColor(np.asarray(rgb), cv2.COLOR_RGB2BGR)
    out = _sr[key].upsample(bgr)
    return Image.fromarray(cv2.cvtColor(out, cv2.COLOR_BGR2RGB))


def enhance(im, cache_file, model):
    """Return an enlarged, sharpened version of a small image (cached)."""
    if os.path.exists(cache_file):
        return Image.open(cache_file).convert(im.mode)
    w, h = im.size
    scale = 4 if w * 2 < TARGET and model == 'fsrcnn' else 2
    alpha = im.getchannel('A') if im.mode == 'RGBA' else None
    big = superres(im.convert('RGB'), scale, model)
    big = big.filter(ImageFilter.UnsharpMask(radius=1.2, percent=40, threshold=2))
    if alpha is not None:
        big.putalpha(alpha.resize(big.size, Image.LANCZOS))
    if big.width > 2400:
        big = big.resize((2400, round(big.height * 2400 / big.width)), Image.LANCZOS)
    big.save(cache_file)
    return big


items = json.load(open(os.path.join(HERE, 'cache', 'list.json'), encoding='utf-8'))
manifest = {}
t0 = time.time()
for n, it in enumerate(items, 1):
    f = it.get('file')
    if not f or not os.path.exists(f):
        continue
    try:
        im = Image.open(f)
        im = ImageOps.exif_transpose(im)
        im = im.convert('RGBA') if im.mode in ('RGBA', 'LA', 'P') else im.convert('RGB')
    except Exception as e:
        print('skip', it['url'], e, file=sys.stderr)
        continue
    ow, oh = im.size
    upscaled = False
    if ow <= 700:
        model = 'edsr' if it['id'].startswith(PRIORITY) else 'fsrcnn'
        im = enhance(im, os.path.join(SR_CACHE, it['id'] + '.png'), model)
        upscaled = model
    elif ow < TARGET:
        im = im.filter(ImageFilter.UnsharpMask(radius=1.0, percent=35, threshold=2))
    w, h = im.size
    widths = sorted({x for x in WIDTHS if x < w} | {min(w, WIDTHS[-1])})
    for tw in widths:
        dst = os.path.join(OUT, f"{it['id']}-{tw}.webp")
        th = round(h * tw / w)
        im.resize((tw, th), Image.LANCZOS).save(dst, 'WEBP', quality=QUALITY, method=6)
    manifest[it['url']] = {'id': it['id'], 'w': w, 'h': h, 'widths': widths}
    print(f'[{n}/{len(items)}] {it["id"]}: {ow}x{oh} -> {w}x{h}{f" (AI {upscaled})" if upscaled else ""}  {time.time() - t0:.0f}s', flush=True)

# remove stale sizes from earlier runs
keep = {f"{m['id']}-{w}.webp" for m in manifest.values() for w in m['widths']}
for x in os.listdir(OUT):
    if x not in keep:
        os.remove(os.path.join(OUT, x))

json.dump(manifest, open(os.path.join(HERE, 'data', 'images.json'), 'w', encoding='utf-8'), indent=1)
total = sum(os.path.getsize(os.path.join(OUT, x)) for x in os.listdir(OUT))
print(f'{len(manifest)} images -> {len(os.listdir(OUT))} webp files, {total / 1e6:.1f} MB')
