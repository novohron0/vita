"""Рендер обоев: сетка точек (месяц / год / жизнь / цель) в PNG под экран айфона."""
from __future__ import annotations

import calendar
import math
import os
import re
from datetime import date, timedelta
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent.parent
DATA = Path(os.environ.get("VITA_DATA") or (ROOT / "data"))

W, H = 1179, 2556  # iPhone Pro, любое iOS-устройство отмасштабирует
GAP = 0.45  # зазор между точками, в долях диаметра
LIFE_YEARS = 90

COLORS = ["#f2f2f2", "#3da9fc", "#34c759", "#ff9500", "#c7c7cc", "#a78bfa", "#ff6b81", "#ff5fa2"]
# base-цвет фона (для пустых точек и текста); сцены дорисовываются в _paint_bg —
# координаты 1:1 с paintBG в static/app.js, чтобы превью было честным
BGS = {
    "black": "#000000", "white": "#f4f1ec", "navy": "#0d1526",
    "sunset": "#2a1230", "mountains": "#0e1520", "ocean": "#0a1a2b",
    "dembel": "#1a1f14", "ramadan": "#0a1228", "honeymoon": "#2a1520",
    "custom": "#1a1a1a",
}
SCENE_GRADS = {
    "sunset": (("#331539", 0.0), ("#4a1c40", 0.45), ("#1c0d24", 1.0)),
    "mountains": (("#16202e", 0.0), ("#0e1520", 0.6), ("#090d13", 1.0)),
    "ocean": (("#0e2138", 0.0), ("#0a1a2b", 0.55), ("#062433", 1.0)),
    "dembel": (("#2a3320", 0.0), ("#3d4a2a", 0.42), ("#141a0e", 1.0)),
    "ramadan": (("#0f1a3d", 0.0), ("#1a1445", 0.48), ("#080e20", 1.0)),
    "honeymoon": (("#4a2038", 0.0), ("#6b3050", 0.38), ("#1f1018", 1.0)),
}
MODES = ("month", "year", "life", "goal")

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


def _rgb(hx: str) -> tuple[int, int, int]:
    return tuple(int(hx[i:i + 2], 16) for i in (1, 3, 5))


def _blend(fg: str, bg: str, alpha: float) -> tuple[int, int, int]:
    f, b = _rgb(fg), _rgb(bg)
    return tuple(round(f[i] * alpha + b[i] * (1 - alpha)) for i in range(3))


def _bg_key(raw) -> str:
    if raw == "custom":
        return "custom"
    return raw if raw in BGS else "black"


def cover_crop(img: Image.Image, tw: int, th: int) -> Image.Image:
    iw, ih = img.size
    scale = max(tw / iw, th / ih)
    nw, nh = int(iw * scale), int(ih * scale)
    img = img.resize((nw, nh), Image.Resampling.LANCZOS)
    left, top = (nw - tw) // 2, (nh - th) // 2
    return img.crop((left, top, left + tw, top + th))


def _load_custom_bg(bg_id: str) -> Image.Image | None:
    path = DATA / "bg" / f"{bg_id}.jpg"
    if not path.exists():
        return None
    return Image.open(path).convert("RGB")


def _paint_wallpaper_bg(cfg: dict, bg_key: str) -> Image.Image:
    if bg_key == "custom":
        bg_id = cfg.get("bgImage", "")
        custom = _load_custom_bg(bg_id) if bg_id else None
        if custom:
            return custom
        return Image.new("RGB", (W, H), BGS["custom"])
    bg = BGS[bg_key]
    img = Image.new("RGB", (W, H), bg)
    _paint_bg(ImageDraw.Draw(img), bg_key, bg)
    return img


def _glass_dot(img: Image.Image, box, color: str, shape: str, mode: str = "filled") -> None:
    """Точка «жидкое стекло» — полупрозрачная заливка, блик, кромка."""
    x0, y0, x1, y1 = int(box[0]), int(box[1]), int(box[2]), int(box[3])
    w, h = x1 - x0, y1 - y0
    if w < 2:
        return
    layer = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    r, g, b = _rgb(color)
    rad = int(min(w, h) * 0.3) if shape == "rounded" else 0
    ib = (0, 0, w - 1, h - 1)

    def shape_draw(fill=None, outline=None, width=0):
        if shape == "circle":
            d.ellipse(ib, fill=fill, outline=outline, width=width)
        elif shape == "square":
            d.rectangle(ib, fill=fill, outline=outline, width=width)
        else:
            d.rounded_rectangle(ib, radius=rad, fill=fill, outline=outline, width=width)

    if mode == "empty":
        shape_draw((255, 255, 255, 50), (255, 255, 255, 75), max(1, round(w * 0.06)))
    elif mode == "ring":
        shape_draw((255, 255, 255, 40))
        shape_draw(None, (r, g, b, 215), max(2, round(w * 0.09)))
    else:
        shape_draw((r, g, b, 168))
        d.ellipse((int(w * 0.12), int(h * 0.08), int(w * 0.62), int(h * 0.42)), fill=(255, 255, 255, 88))
        shape_draw(None, (255, 255, 255, 105), max(1, round(w * 0.065)))
    img.paste(layer, (x0, y0), layer)


def _paint_bg(draw: ImageDraw.ImageDraw, key: str, base: str) -> None:
    """Сцена-фон: вертикальный градиент + силуэты (горы/океан/закат). Для сплошных — no-op."""
    stops = SCENE_GRADS.get(key)
    if not stops:
        return
    for y in range(H):
        t = y / (H - 1)
        col = _rgb(stops[-1][0])
        for (c1, p1), (c2, p2) in zip(stops, stops[1:]):
            if t <= p2:
                f = 0.0 if p2 == p1 else (t - p1) / (p2 - p1)
                a, b = _rgb(c1), _rgb(c2)
                col = tuple(round(a[i] + (b[i] - a[i]) * f) for i in range(3))
                break
        draw.line(((0, y), (W, y)), fill=col)
    if key == "mountains":
        draw.ellipse((940, 265, 1030, 355), fill=_blend("#e8eef5", base, 0.5))
        draw.polygon([(0, 2556), (0, 2440), (300, 2280), (620, 2470), (830, 2360), (1179, 2520), (1179, 2556)], fill="#141c28")
        draw.polygon([(0, 2556), (150, 2430), (470, 2556)], fill="#0c1119")
        draw.polygon([(560, 2556), (860, 2380), (1179, 2556)], fill="#0c1119")
    elif key == "ocean":
        draw.ellipse((940, 265, 1030, 355), fill=_blend("#dfe9f2", base, 0.45))
        draw.line(((0, 2300), (W, 2300)), fill=_blend("#ffffff", base, 0.14), width=3)
        refl = _blend("#dfe9f2", base, 0.16)
        for w2, yy in ((150, 2360), (110, 2415), (70, 2470), (40, 2520)):
            draw.line(((985 - w2 / 2, yy), (985 + w2 / 2, yy)), fill=refl, width=8)
    elif key == "sunset":
        draw.ellipse((W / 2 - 400, 2330, W / 2 + 400, 3130), fill=_blend("#ff9b6a", base, 0.32))
        draw.line(((0, 2330), (W, 2330)), fill=_blend("#ffb37c", base, 0.20), width=3)
    elif key == "dembel":
        for x, y, r in ((180, 280, 2.5), (320, 220, 2), (890, 350, 2.5), (1020, 190, 1.5)):
            draw.ellipse((x - r, y - r, x + r, y + r), fill=_blend("#e8e4c8", base, 0.55))
        draw.line(((0, 2480), (W, 2480)), fill=_blend("#5a6a38", base, 0.32), width=4)
        draw.polygon([(0, 2556), (0, 2460), (180, 2460), (180, 2380), (280, 2320), (380, 2380),
                      (380, 2460), (620, 2460), (620, 2400), (720, 2340), (820, 2400), (820, 2460),
                      (1179, 2460), (1179, 2556)], fill="#1e2618")
        draw.polygon([(950, 2556), (980, 2340), (1010, 2340), (1040, 2556)], fill="#161c10")
        draw.rectangle((60, 2440, 95, 2556), fill="#1a2214")
        sx, sy, sr = 200, 360, 22
        star = []
        for i in range(10):
            a = -math.pi / 2 + (i * math.pi) / 5
            rr = sr * 0.42 if i % 2 else sr
            star.append((sx + math.cos(a) * rr, sy + math.sin(a) * rr))
        draw.polygon(star, fill=_blend("#c8c4a0", base, 0.45))
    elif key == "ramadan":
        for x, y, r in ((120, 200, 2), (450, 180, 1.5), (780, 240, 2), (200, 400, 1.5), (600, 150, 1.5)):
            draw.ellipse((x - r, y - r, x + r, y + r), fill=_blend("#f5e6b8", base, 0.75))
        draw.ellipse((872, 272, 968, 368), fill=_blend("#f5e6b8", base, 0.78))
        draw.ellipse((908, 268, 988, 348), fill=(15, 26, 61))
        draw.rectangle((0, 2500, W, 2556), fill="#0c1020")
        draw.rectangle((160, 2420, 200, 2556), fill="#0c1020")
        draw.polygon([(150, 2420), (210, 2420), (180, 2360)], fill="#0c1020")
        draw.rectangle((480, 2440, 700, 2556), fill="#0c1020")
        draw.ellipse((500, 2290, 680, 2470), fill="#0c1020")
        draw.rectangle((960, 2420, 1000, 2556), fill="#0c1020")
        draw.polygon([(950, 2420), (1010, 2420), (980, 2350)], fill="#0c1020")
    elif key == "honeymoon":
        draw.ellipse((W / 2 - 360, 2360, W / 2 + 360, 3080), fill=_blend("#ffb8c8", base, 0.28))
        draw.ellipse((W / 2 - 280, 2460, W / 2 + 280, 3020), fill=_blend("#ffd4a8", base, 0.22))
        draw.line(((0, 2380), (W, 2380)), fill=_blend("#ffb8c8", base, 0.18), width=3)
        draw.polygon([(120, 2556), (120, 2280), (155, 2180), (190, 2280), (190, 2556)], fill="#1a0c14")
        draw.polygon([(990, 2556), (990, 2300), (1025, 2200), (1060, 2300), (1060, 2556)], fill="#1a0c14")
        refl = _blend("#ffb8c8", base, 0.14)
        for w2, yy in ((200, 2440), (150, 2485), (100, 2520)):
            draw.line(((W / 2 - w2 / 2, yy), (W / 2 + w2 / 2, yy)), fill=refl, width=6)
        draw.ellipse((322, 502, 358, 538), fill=_blend("#ff8fab", base, 0.35))
        draw.ellipse((344, 506, 372, 534), fill=(74, 32, 56))
        draw.ellipse((386, 546, 414, 574), fill=_blend("#ff8fab", base, 0.3))
        draw.ellipse((403, 549, 425, 571), fill=(74, 32, 56))


def _parse_date(value, fallback: date) -> date:
    try:
        return date.fromisoformat(value or "")
    except (ValueError, TypeError):
        return fallback


def _counts(cfg: dict, mode: str, today: date) -> tuple[int, int, int | None]:
    """(всего точек, закрашено, индекс текущей точки-кольца)."""
    if mode == "month":
        total = calendar.monthrange(today.year, today.month)[1]
        return total, today.day - 1, today.day - 1
    if mode == "year":
        total = 366 if calendar.isleap(today.year) else 365
        doy = today.timetuple().tm_yday
        return total, doy - 1, doy - 1
    if mode == "goal":
        start = _parse_date(cfg.get("start"), today.replace(day=1))
        end = _parse_date(cfg.get("end"), start + timedelta(days=30))
        total = max(1, (end - start).days)
        done = min(max((today - start).days, 0), total)
        return total, done, done if done < total else None
    birth = _parse_date(cfg.get("birth"), date(2000, 1, 1))
    total = LIFE_YEARS * 52
    done = min(max(0, (today - birth).days // 7), total)
    return total, done, done if done < total else None


def _cols(mode: str, total: int) -> int:
    if mode == "goal":
        return 6 if total <= 42 else 10 if total <= 120 else 14
    return {"month": 6, "year": 14, "life": 52}[mode]


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
    if mode == "goal":
        return f"прошло {done} · осталось {total - done}"
    return f"день {min(done + 1, total)} из {total}"


def _watermark(draw: ImageDraw.ImageDraw, cx: float, cy: float, fill) -> None:
    """Мини-логотип: 6 точек + «vita» (вирусный штамп на бесплатных обоях)."""
    font = _font(32)
    label = "vita"
    r, dx, dy = 5, 17, 15
    dots_w = 2 * dx + 2 * r
    text_w = draw.textlength(label, font=font)
    x = cx - (dots_w + 14 + text_w) / 2
    for i in range(3):
        for j in range(2):
            px, py = x + r + i * dx, cy + (j - 0.5) * dy
            draw.ellipse((px - r, py - r, px + r, py + r), fill=fill)
    draw.text((x + dots_w + 14, cy), label, font=font, fill=fill, anchor="lm")


def _streak(done_idx: set[int], upto: int) -> int:
    """Текущая цепочка: подряд идущие выполненные дни, кончающиеся сегодня (или вчера — льгота)."""
    if upto < 0:
        return 0
    end = upto if upto in done_idx else upto - 1
    n = 0
    while end >= 0 and end in done_idx:
        n += 1
        end -= 1
    return n


def render_goal(goal: dict, done: set[str], today: date | None = None) -> Image.Image:
    """Обои-виджет цели: сетка дней (клетка = день), закрашены выполненные, сегодня — кольцо."""
    today = today or date.today()
    bg_key = _bg_key(goal.get("bg", ""))
    bg = BGS[bg_key]
    color = goal.get("color") or "#34c759"
    if not re.fullmatch(r"#[0-9a-fA-F]{6}", color):
        color = "#34c759"
    shape = goal.get("shape", "circle")
    title = (goal.get("title") or "").strip().upper()
    start = _parse_date(goal.get("start"), today)
    days = max(1, min(int(goal.get("days", 30)), 365))

    done_idx = {(_parse_date(d, start) - start).days for d in done}
    done_idx = {i for i in done_idx if 0 <= i < days}
    today_idx = (today - start).days
    done_count = len(done_idx)
    streak = _streak(done_idx, min(today_idx, days - 1))

    text = "#8a857a" if bg_key == "white" else "#8e8e8e"

    cols = _cols("goal", days)
    rows = math.ceil(days / cols)

    img = _paint_wallpaper_bg(goal, bg_key) if bg_key == "custom" else None
    if img is None:
        img = Image.new("RGB", (W, H), bg)
        _paint_bg(ImageDraw.Draw(img), bg_key, bg)
    draw = ImageDraw.Draw(img)

    max_w, max_h = W * 0.72, H * 0.50
    dot = min(max_w / (cols + (cols - 1) * GAP), max_h / (rows + (rows - 1) * GAP))
    if cols <= 10:
        dot = min(dot, 110)
    gap = dot * GAP
    grid_w = cols * dot + (cols - 1) * gap
    grid_h = rows * dot + (rows - 1) * gap
    x0 = (W - grid_w) / 2
    y0 = H * 0.55 - grid_h / 2

    for i in range(days):
        r, c = divmod(i, cols)
        x, y = x0 + c * (dot + gap), y0 + r * (dot + gap)
        box = (x, y, x + dot, y + dot)
        if i in done_idx:
            _glass_dot(img, box, color, shape, "filled")
        elif i == today_idx:
            _glass_dot(img, box, color, shape, "ring")
        else:
            _glass_dot(img, box, color, shape, "empty")

    if title:
        draw.text((W / 2, y0 - 190), title, font=_font(64), fill=color, anchor="mm")
    _watermark(draw, W / 2, y0 - 110, text)
    footer = f"{done_count} из {days} · стрик {streak}"
    if done_count >= days:
        footer = "цель закрыта · 🎁 забирай награду"
    draw.text((W / 2, y0 + grid_h + 130), footer, font=_font(40), fill=text, anchor="mm")
    return img


def render_wallpaper(cfg: dict, today: date | None = None, expired: bool = False) -> Image.Image:
    today = today or date.today()
    mode = cfg.get("mode") if cfg.get("mode") in MODES else "month"
    bg_key = _bg_key(cfg.get("bg", ""))
    bg = BGS[bg_key]
    color = cfg.get("color") or "#f2f2f2"
    if not re.fullmatch(r"#[0-9a-fA-F]{6}", color):
        color = "#f2f2f2"
    shape = cfg.get("shape", "circle")
    title = (cfg.get("title") or "").strip().upper()

    text = "#8a857a" if bg_key == "white" else "#8e8e8e"

    total, done, current = _counts(cfg, mode, today)
    cols = _cols(mode, total)
    rows = math.ceil(total / cols)

    img = _paint_wallpaper_bg(cfg, bg_key)
    draw = ImageDraw.Draw(img)

    max_w, max_h = W * 0.72, H * 0.50
    dot = min(max_w / (cols + (cols - 1) * GAP), max_h / (rows + (rows - 1) * GAP))
    if cols <= 10:
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
            _glass_dot(img, box, color, shape, "filled")
        elif current is not None and i == current:
            _glass_dot(img, box, color, shape, "ring")
        else:
            _glass_dot(img, box, color, shape, "empty")

    if title:
        draw.text((W / 2, y0 - 190), title, font=_font(64), fill=color, anchor="mm")
    if cfg.get("brand", True):
        _watermark(draw, W / 2, y0 - 110, text)
    if expired:
        # доступ кончился: прогресс заморожен (today = дата окончания), обои сами напоминают
        draw.text((W / 2, y0 + grid_h + 130), "точки замерли · продли на vita",
                  font=_font(40), fill=color, anchor="mm")
    elif cfg.get("footer", True):
        draw.text(
            (W / 2, y0 + grid_h + 130),
            _footer(mode, total, done),
            font=_font(40),
            fill=text,
            anchor="mm",
        )
    return img
