"""Рендер обоев: сетка точек (месяц / год / жизнь) в PNG под экран айфона."""
from __future__ import annotations

import calendar
import math
from datetime import date

from PIL import Image, ImageDraw, ImageFont

W, H = 1179, 2556  # iPhone Pro, любое iOS-устройство отмасштабирует
GAP = 0.45  # зазор между точками, в долях диаметра
LIFE_YEARS = 90

THEMES = {
    "obsidian": {"bg": "#000000", "filled": "#f2f2f2", "empty": "#262626", "text": "#8e8e8e"},
    "ivory":    {"bg": "#f4f1e8", "filled": "#141414", "empty": "#d9d4c7", "text": "#8a857a"},
    "ocean":    {"bg": "#020407", "filled": "#4aa8ff", "empty": "#0e2338", "text": "#57748f"},
    "forest":   {"bg": "#020604", "filled": "#3ddc84", "empty": "#0e2c1b", "text": "#5e8a71"},
    "sunset":   {"bg": "#070302", "filled": "#ff8c42", "empty": "#33190c", "text": "#8f6a55"},
}

COLS = {"month": 6, "year": 14, "life": 52}

# первый существующий шрифт с кириллицей: сначала macOS, затем Linux (сервер)
FONT_PATHS = [
    "/System/Library/Fonts/SFNS.ttf",
    "/System/Library/Fonts/Supplemental/Arial.ttf",
    "/System/Library/Fonts/Helvetica.ttc",
    "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
]


def _font(size: int):
    for path in FONT_PATHS:
        try:
            return ImageFont.truetype(path, size)
        except OSError:
            continue
    return ImageFont.load_default(size)


def _counts(mode: str, today: date, birth: date) -> tuple[int, int, int | None]:
    """(всего точек, закрашено, индекс текущей точки-кольца)."""
    if mode == "month":
        total = calendar.monthrange(today.year, today.month)[1]
        return total, today.day - 1, today.day - 1
    if mode == "year":
        total = 366 if calendar.isleap(today.year) else 365
        doy = today.timetuple().tm_yday
        return total, doy - 1, doy - 1
    total = LIFE_YEARS * 52
    lived = max(0, (today - birth).days // 7)
    done = min(lived, total)
    return total, done, done if done < total else None


def _weeks_word(n: int) -> str:
    if n % 100 in (11, 12, 13, 14) or n % 10 in (0, 5, 6, 7, 8, 9):
        return "недель"
    if n % 10 == 1:
        return "неделя"
    return "недели"


def _footer(mode: str, total: int, done: int) -> str:
    def fmt(n: int) -> str:
        return f"{n:,}".replace(",", " ")

    if mode == "life":
        return f"{fmt(done)} {_weeks_word(done)} прожито · {fmt(total - done)} впереди"
    return f"день {min(done + 1, total)} из {total}"


def render_wallpaper(cfg: dict, today: date | None = None) -> Image.Image:
    today = today or date.today()
    mode = cfg.get("mode") if cfg.get("mode") in COLS else "month"
    theme = THEMES.get(cfg.get("theme", ""), THEMES["obsidian"])
    shape = cfg.get("shape", "circle")
    title = (cfg.get("title") or "").strip().upper()
    try:
        birth = date.fromisoformat(cfg.get("birth") or "2000-01-01")
    except ValueError:
        birth = date(2000, 1, 1)

    total, done, current = _counts(mode, today, birth)
    cols = COLS[mode]
    rows = math.ceil(total / cols)

    img = Image.new("RGB", (W, H), theme["bg"])
    draw = ImageDraw.Draw(img)

    max_w, max_h = W * 0.72, H * 0.50
    dot = min(max_w / (cols + (cols - 1) * GAP), max_h / (rows + (rows - 1) * GAP))
    if mode == "month":
        dot = min(dot, 110)
    gap = dot * GAP
    grid_w = cols * dot + (cols - 1) * gap
    grid_h = rows * dot + (rows - 1) * gap
    x0 = (W - grid_w) / 2
    y0 = H * 0.55 - grid_h / 2

    for i in range(total):
        r, c = divmod(i, cols)
        x, y = x0 + c * (dot + gap), y0 + r * (dot + gap)
        box = (x, y, x + dot, y + dot)
        if i < done:
            fill, outline, width = theme["filled"], None, 0
        elif current is not None and i == current:
            fill, outline, width = None, theme["filled"], max(2, round(dot * 0.09))
        else:
            fill, outline, width = theme["empty"], None, 0
        if shape == "square":
            draw.rectangle(box, fill=fill, outline=outline, width=width)
        elif shape == "rounded":
            draw.rounded_rectangle(box, radius=dot * 0.3, fill=fill, outline=outline, width=width)
        else:
            draw.ellipse(box, fill=fill, outline=outline, width=width)

    if title:
        draw.text((W / 2, y0 - 170), title, font=_font(64), fill=theme["filled"], anchor="mm")
    if cfg.get("footer", True):
        draw.text(
            (W / 2, y0 + grid_h + 130),
            _footer(mode, total, done),
            font=_font(40),
            fill=theme["text"],
            anchor="mm",
        )
    return img
