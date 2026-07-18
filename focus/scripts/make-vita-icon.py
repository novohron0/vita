#!/usr/bin/env python3
"""Generate the minimal Vita dot icon used by the site and native apps."""

from __future__ import annotations

import math
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter


MASTER_SIZE = 1024


def mix(a: tuple[int, int, int], b: tuple[int, int, int], amount: float) -> tuple[int, int, int]:
    amount = max(0.0, min(1.0, amount))
    return tuple(round(x + (y - x) * amount) for x, y in zip(a, b))


def radial(x: float, y: float, cx: float, cy: float, radius: float) -> float:
    distance = math.hypot(x - cx, y - cy)
    return max(0.0, 1.0 - distance / radius)


def generate_master() -> Image.Image:
    size = MASTER_SIZE
    image = Image.new("RGB", (size, size))
    pixels = image.load()

    base_top = (17, 15, 27)
    base_bottom = (5, 6, 11)
    violet = (88, 43, 142)
    blue = (24, 82, 126)
    for y in range(size):
        ny = y / (size - 1)
        for x in range(size):
            nx = x / (size - 1)
            color = mix(base_top, base_bottom, ny * 0.82 + nx * 0.18)
            color = mix(color, violet, radial(nx, ny, 0.18, 0.12, 0.72) * 0.34)
            color = mix(color, blue, radial(nx, ny, 0.88, 0.86, 0.68) * 0.22)
            pixels[x, y] = color

    image = image.convert("RGBA")
    glow = Image.new("RGBA", image.size, (0, 0, 0, 0))
    glow_draw = ImageDraw.Draw(glow)
    center = size // 2
    glow_radius = round(size * 0.145)
    glow_draw.ellipse(
        (center - glow_radius, center - glow_radius, center + glow_radius, center + glow_radius),
        fill=(168, 85, 247, 92),
    )
    glow = glow.filter(ImageFilter.GaussianBlur(round(size * 0.07)))
    image = Image.alpha_composite(image, glow)

    dots = Image.new("RGBA", image.size, (0, 0, 0, 0))
    draw = ImageDraw.Draw(dots)
    positions = (0.285, 0.5, 0.715)
    radius = round(size * 0.061)
    opacity = (
        (88, 156, 88),
        (174, 255, 174),
        (88, 174, 88),
    )

    for row, py in enumerate(positions):
        for column, px in enumerate(positions):
            cx = round(size * px)
            cy = round(size * py)
            box = (cx - radius, cy - radius, cx + radius, cy + radius)
            if row == 1 and column == 1:
                draw.ellipse(box, fill=(168, 85, 247, 255), outline=(216, 180, 255, 92), width=max(2, size // 180))
            else:
                alpha = opacity[row][column]
                draw.ellipse(box, fill=(238, 238, 247, alpha), outline=(255, 255, 255, 38), width=max(2, size // 220))

    image = Image.alpha_composite(image, dots)

    # A single restrained edge highlight keeps the icon crisp without drawing
    # another rounded square inside the system-provided app icon mask.
    edge = Image.new("RGBA", image.size, (0, 0, 0, 0))
    edge_draw = ImageDraw.Draw(edge)
    edge_draw.line(
        ((0, 0), (size - 1, 0)),
        fill=(255, 255, 255, 28),
        width=max(1, size // 256),
    )
    return Image.alpha_composite(image, edge).convert("RGB")


def generate_macos_icon(source: Image.Image) -> Image.Image:
    """Place the full-bleed iOS artwork on a native macOS rounded tile."""
    size = MASTER_SIZE
    tile_size = 824
    inset = (size - tile_size) // 2
    corner_radius = 185
    tile = source.convert("RGBA").resize((tile_size, tile_size), Image.Resampling.LANCZOS)

    tile_mask = Image.new("L", (tile_size, tile_size), 0)
    ImageDraw.Draw(tile_mask).rounded_rectangle(
        (0, 0, tile_size - 1, tile_size - 1),
        radius=corner_radius,
        fill=255,
    )

    canvas = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    shadow = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    shadow_mask = Image.new("L", (size, size), 0)
    ImageDraw.Draw(shadow_mask).rounded_rectangle(
        (inset, inset + 18, inset + tile_size - 1, inset + tile_size + 17),
        radius=corner_radius,
        fill=92,
    )
    shadow_mask = shadow_mask.filter(ImageFilter.GaussianBlur(26))
    shadow.putalpha(shadow_mask)
    canvas = Image.alpha_composite(canvas, shadow)
    canvas.paste(tile, (inset, inset), tile_mask)
    return canvas


def main() -> int:
    if len(sys.argv) == 4 and sys.argv[1] == "--mac":
        source_path = Path(sys.argv[2])
        output_path = Path(sys.argv[3])
        output_path.parent.mkdir(parents=True, exist_ok=True)
        source = Image.open(source_path)
        generate_macos_icon(source).save(output_path, "PNG", optimize=True)
        print(f"generated macOS Vita icon: {output_path}")
        return 0

    if len(sys.argv) != 3:
        print(
            f"usage: {sys.argv[0]} <apple-touch.png> <favicon.png>\n"
            f"       {sys.argv[0]} --mac <source.png> <mac-output.png>",
            file=sys.stderr,
        )
        return 1

    master_path = Path(sys.argv[1])
    favicon_path = Path(sys.argv[2])
    master_path.parent.mkdir(parents=True, exist_ok=True)
    favicon_path.parent.mkdir(parents=True, exist_ok=True)

    master = generate_master()
    master.save(master_path, "PNG", optimize=True)
    master.resize((48, 48), Image.Resampling.LANCZOS).save(favicon_path, "PNG", optimize=True)
    print(f"generated Vita icon: {master_path} and {favicon_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
