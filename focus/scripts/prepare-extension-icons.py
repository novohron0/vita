#!/usr/bin/env python3
"""Safari iOS treats gray icons as templates → blue tint. Force real color.

Правило: детектору Safari нужны по-настоящему насыщенные пиксели
(перепад RGB-каналов десятки единиц, а не 10-16 на почти чёрном фоне).
Поэтому: точки — серебро с фиолетовым отливом, центр — фиолетовый акцент,
фон — слабый цветной градиент. Визуально иконка остаётся «тёмной vita».
"""
from __future__ import annotations

import sys
from pathlib import Path

from PIL import Image, ImageDraw

SIZES = (16, 19, 32, 38, 48, 72, 96, 128, 144, 256)

# Фиолетовый акцент vitadots: множители к яркости пикселя.
SHEEN = (1.00, 0.90, 1.20)      # серебристые точки → лёгкий лиловый отлив
ACCENT = (0.98, 0.72, 1.55)     # центральная точка → явный фиолетовый


def prepare_icon(src: Path, dst: Path, size: int) -> None:
    img = Image.open(src).convert("RGBA")
    img = img.resize((size, size), Image.Resampling.LANCZOS)

    out = Image.new("RGB", (size, size))
    px = out.load()
    for y in range(size):
        for x in range(size):
            t = (x + y) / max(size * 2 - 2, 1)
            px[x, y] = (
                int(10 + t * 16),
                int(8 + t * 8),
                int(16 + (1 - t) * 22),
            )

    out.paste(img, mask=img.split()[3])

    px = out.load()
    cx = cy = (size - 1) / 2
    accent_r = size * 0.17
    for y in range(size):
        for x in range(size):
            r, g, b = px[x, y]
            lum = (r * 299 + g * 587 + b * 114) // 1000
            if lum > 70:
                # Чем ярче пиксель, тем сильнее цветовой отлив.
                in_center = ((x - cx) ** 2 + (y - cy) ** 2) ** 0.5 <= accent_r
                mr, mg, mb = ACCENT if in_center else SHEEN
                k = min(1.0, (lum - 70) / 120) * (0.85 if in_center else 0.45)
                tr = min(255, int(lum * mr))
                tg = min(255, int(lum * mg))
                tb = min(255, int(lum * mb) + (12 if not in_center else 30))
                px[x, y] = (
                    int(r * (1 - k) + tr * k),
                    int(g * (1 - k) + tg * k),
                    int(b * (1 - k) + tb * k),
                )
            else:
                # Фон: мягкий фиолетово-синий градиент вместо чистого серого.
                px[x, y] = (
                    min(255, r + int((x / max(size - 1, 1)) * 8)),
                    g,
                    min(255, b + 6 + int((y / max(size - 1, 1)) * 10)),
                )

    if size >= 32:
        draw = ImageDraw.Draw(out)
        edge = (34, 26, 56)
        draw.rectangle((0, 0, size - 1, size - 1), outline=edge, width=max(1, size // 32))

    dst.parent.mkdir(parents=True, exist_ok=True)
    out.save(dst, format="PNG", optimize=True)


def main() -> int:
    if len(sys.argv) != 3:
        print(f"usage: {sys.argv[0]} <src.png> <out-dir>", file=sys.stderr)
        return 1
    src = Path(sys.argv[1])
    out_dir = Path(sys.argv[2])
    if not src.is_file():
        print(f"missing {src}", file=sys.stderr)
        return 1
    for size in SIZES:
        prepare_icon(src, out_dir / f"icon{size}.png", size)
    prepare_icon(src, out_dir.parent / "popup" / "icon.png", 56)
    prepare_icon(src, out_dir.parent / "icon.png", 128)
    print(f"prepared {len(SIZES) + 2} color icons in {out_dir}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
