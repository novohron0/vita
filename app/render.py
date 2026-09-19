"""Рендер обоев: сетка точек (месяц / год / жизнь / цель) в PNG под экран айфона."""
from __future__ import annotations

import calendar
import math
import os
import re
import unicodedata
from datetime import date, timedelta
from pathlib import Path

from PIL import Image, ImageChops, ImageDraw, ImageFont, ImageOps

from . import scenes

ROOT = Path(__file__).resolve().parent.parent
DATA = Path(os.environ.get("VITA_DATA") or (ROOT / "data"))

W, H = 1179, 2556  # iPhone Pro, любое iOS-устройство отмасштабирует
GAP = 0.45  # зазор между точками, в долях диаметра
LIFE_YEARS = 90

COLORS = ["#f2f2f2", "#2b2b30", "#3da9fc", "#34c759", "#ff9500", "#c7c7cc", "#a78bfa", "#ff6b81", "#ff5fa2"]
# base-цвет фона (для пустых точек и текста); сцены дорисовываются в _paint_bg —
# координаты 1:1 с paintBG в static/app.js, чтобы превью было честным
BGS = {
    "black": "#000000", "white": "#f4f1ec", "navy": "#0d1526",
    "sunset": "#2a1230", "mountains": "#0e1520", "ocean": "#0a1a2b",
    "dembel": "#1a1f14", "ramadan": "#0a1228", "honeymoon": "#2a1520",
    "custom": "#1a1a1a",
    "owncolor": "#101014",   # фон, который человек выбрал сам
    **scenes.SCENE_BASE,     # темы-сцены: поле, ромашки, тайга, тушь, манга, туман
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
SHAPES = frozenset({"circle", "square", "rounded", "heart", "star", "diamond", "hex", *scenes.NEW_SHAPES})

# первый существующий шрифт с кириллицей: сначала macOS, затем Linux (сервер)
FONT_PATHS = [
    "/System/Library/Fonts/SFNS.ttf",
    "/System/Library/Fonts/Supplemental/Arial.ttf",
    "/System/Library/Fonts/Helvetica.ttc",
    "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
]


# Шрифты заголовка. Файлы лежат в static/fonts и едут в образ вместе с кодом:
# ставить пакеты в Dockerfile нельзя — в браузере должны быть ровно эти же
# начертания, иначе превью разойдётся с обоями. k — поправка размера, те же
# числа лежат в static/app.js.
TITLE_FONTS = {
    "montserrat": ("montserrat.ttf", 0.96),
    "playfair": ("playfair.ttf", 1.02),
    "oswald": ("oswald.ttf", 1.08),
    "unbounded": ("unbounded.ttf", 0.88),
    "russo": ("russo.ttf", 0.98),
    "caveat": ("caveat.ttf", 1.3),
    "pacifico": ("pacifico.ttf", 0.98),
    "ptnarrow": ("ptnarrow.ttf", 1.1),
    "ptserif": ("ptserif.ttf", 1.08),
}
FONT_DIR = Path(__file__).resolve().parent.parent / "static" / "fonts"


def _font(size: int):
    for path in FONT_PATHS:
        try:
            return ImageFont.truetype(path, size)
        except OSError:
            continue
    return ImageFont.load_default(size)


def _title_font(size: int, key: str):
    """Шрифт заголовка обоев; незнакомое имя и системный — обычный шрифт."""
    item = TITLE_FONTS.get(str(key or "").strip())
    if not item:
        return _font(size)
    name, k = item
    try:
        return ImageFont.truetype(str(FONT_DIR / name), int(round(size * k)))
    except OSError:
        return _font(size)


# Эмодзи обычным шрифтом не рисуются — выходят пустые квадраты. Noto Color
# Emoji хранит картинки только в одном размере (109 точек), поэтому рисуем
# эмодзи отдельным слоем в родном размере и уменьшаем до высоты строки.
EMOJI_FONT_PATHS = [
    "/usr/share/fonts/truetype/noto/NotoColorEmoji.ttf",
    "/System/Library/Fonts/Apple Color Emoji.ttc",
]
EMOJI_NATIVE = 109
# Что считать эмодзи. Перечислять диапазоны руками мало: у Apple на клавиатуре
# есть и флаги, и клавиши-цифры, и склейки семей через ZWJ. Поэтому берём все
# эмодзи-блоки Unicode плюс любой «прочий символ» (категория So) — это и есть
# полный набор стандарта, который Noto Color Emoji умеет рисовать.
_EMOJI_JOINERS = {0x200D, 0xFE0F, 0xFE0E, 0x20E3, 0x1F3FB, 0x1F3FC, 0x1F3FD, 0x1F3FE, 0x1F3FF}
_EMOJI_EXTRA = {0x00A9, 0x00AE, 0x2122, 0x24C2, 0x3030, 0x303D, 0x3297, 0x3299}


def _is_emoji(ch: str) -> bool:
    cp = ord(ch)
    if cp in _EMOJI_JOINERS or cp in _EMOJI_EXTRA:
        return True
    if 0x1F000 <= cp <= 0x1FAFF:          # все эмодзи-блоки, включая флаги
        return True
    if 0x2190 <= cp <= 0x2BFF:            # стрелки, значки, геометрия
        return True
    if 0x2900 <= cp <= 0x297F:
        return True
    return unicodedata.category(ch) == "So" and cp > 0x2000


def _split_emoji(text: str) -> list[tuple[bool, str]]:
    """Режем строку на куски: (это эмодзи, содержимое). Клавиши вида 1️⃣ —
    цифра плюс модификаторы, поэтому цифру забираем в кусок задним числом."""
    out: list[list] = []
    for i, ch in enumerate(text):
        emoji = _is_emoji(ch)
        # «1» перед вариационным селектором — часть клавиши, а не текст
        if not emoji and i + 1 < len(text) and ord(text[i + 1]) in (0xFE0F, 0x20E3):
            emoji = True
        if out and out[-1][0] == emoji:
            out[-1][1] += ch
        else:
            out.append([emoji, ch])
    return [(bool(k), v) for k, v in out]


_emoji_font_cache: dict[str, object] = {}


def _emoji_font():
    if "f" in _emoji_font_cache:
        return _emoji_font_cache["f"]
    font = None
    for path in EMOJI_FONT_PATHS:
        try:
            font = ImageFont.truetype(path, EMOJI_NATIVE)
            break
        except OSError:
            continue
    _emoji_font_cache["f"] = font
    return font


def _emoji_image(chunk: str, height: int) -> Image.Image | None:
    """Кусок с эмодзи, отрисованный цветным шрифтом и уменьшенный до height."""
    font = _emoji_font()
    if font is None:
        return None
    try:
        pad = EMOJI_NATIVE // 4
        box = Image.new("RGBA", (EMOJI_NATIVE * (len(chunk) + 1) + pad * 2, EMOJI_NATIVE * 2), (0, 0, 0, 0))
        d = ImageDraw.Draw(box)
        d.text((pad, pad), chunk, font=font, embedded_color=True)
        box = box.crop(box.getbbox() or (0, 0, 1, 1))
    except Exception:
        return None
    if box.width < 1 or box.height < 1:
        return None
    scale = height / box.height
    return box.resize((max(1, round(box.width * scale)), height), Image.Resampling.LANCZOS)


def draw_text(img: Image.Image, draw: ImageDraw.ImageDraw, xy, text: str,
              font, fill, anchor: str = "mm", stroke: str | None = None) -> None:
    """Текст, в котором эмодзи рисуются картинками, а остальное — шрифтом.
    Держит те же якоря, что и draw.text, чтобы вызовы не переписывать.
    stroke — цвет обводки букв (тема «Манга»), толщина 4."""
    if not text:
        return
    kw = {"stroke_width": 4, "stroke_fill": stroke} if stroke else {}
    parts = _split_emoji(text)
    if not any(is_emoji for is_emoji, _ in parts):
        draw.text(xy, text, font=font, fill=fill, anchor=anchor, **kw)
        return

    size = getattr(font, "size", 40)
    eh = round(size * 1.08)
    pieces = []            # (вид, содержимое, ширина)
    for is_emoji, part in parts:
        if is_emoji:
            im = _emoji_image(part, eh)
            if im is None:
                continue   # шрифта нет — лучше без эмодзи, чем квадраты
            if im.width > eh:  # флаги шире квадрата — ужимаем в своё окно
                im = im.resize((eh, max(1, round(im.height * eh / im.width))))
            pieces.append(("img", im, eh))
        else:
            pieces.append(("txt", part, draw.textlength(part, font=font)))
    if not pieces:
        return

    total = sum(p[2] for p in pieces)
    x, y = xy
    if anchor[0] == "m":
        x -= total / 2
    elif anchor[0] == "r":
        x -= total
    for kind, body, width in pieces:
        if kind == "txt":
            draw.text((x, y), body, font=font, fill=fill, anchor="l" + anchor[1], **kw)
        else:
            top = y - body.height // 2 if anchor[1] == "m" else y
            img.paste(body, (round(x + (width - body.width) / 2), round(top)), body)
        x += width


def text_width(draw: ImageDraw.ImageDraw, text: str, font) -> float:
    """Ширина строки с учётом эмодзи — их рисуют картинками, а не шрифтом."""
    size = getattr(font, "size", 40)
    eh = round(size * 1.08)
    total = 0.0
    for is_emoji, part in _split_emoji(text):
        if is_emoji:
            # окно всегда квадратное, каким бы ни была картинка: браузер меряет
            # так же, иначе строки рвались бы в разных местах
            total += eh if _emoji_image(part, eh) is not None else 0
        else:
            total += draw.textlength(part, font=font)
    return total


# Заголовок бывает длинным — хоть целой цитатой. Он переносится по словам и
# растёт вверх: последняя строка стоит на своём месте над точками, а написанное
# раньше уезжает к верхнему краю. Логика дословно та же, что в static/app.js
# (wrapTitle/drawTitle) — иначе превью разойдётся с обоями.
TITLE_W = W * 0.84
TITLE_TOP = H * 0.085


def _wrap_title(draw: ImageDraw.ImageDraw, text: str, font, max_w: float) -> list[str]:
    """Пробелы человека сохраняем: ими он сам двигает слово по строке. Гаснет
    только тот пробел, на котором строка сломалась."""
    out: list[str] = []
    for part in str(text).split("\n"):
        cur = ""
        for token in re.findall(r"\s+|\S+", part):
            if text_width(draw, cur + token, font) <= max_w:
                cur += token
                continue
            if cur:
                out.append(cur)
                cur = ""
            if not token.strip():
                continue
            if text_width(draw, token, font) <= max_w:
                cur = token
                continue
            chunk = ""
            for ch in token:
                if not chunk or text_width(draw, chunk + ch, font) <= max_w:
                    chunk += ch
                else:
                    out.append(chunk)
                    chunk = ch
            cur = chunk
        if cur:
            out.append(cur)
    return out


def _draw_title(img: Image.Image, draw: ImageDraw.ImageDraw, text: str,
                base_y: float, font_key: str, fill, stroke: str | None = None) -> None:
    px = 64
    while True:
        font = _title_font(px, font_key)
        lines = _wrap_title(draw, text, font, TITLE_W)
        line_h = round(px * 1.2)
        top = base_y - (len(lines) - 1) * line_h - line_h * 0.7
        if top >= TITLE_TOP or px <= 30:
            break
        px -= 3
    for i, line in enumerate(lines):
        y = base_y - (len(lines) - 1 - i) * line_h
        draw_text(img, draw, (W / 2, y), line, font, fill, stroke=stroke)


def _rgb(hx: str) -> tuple[int, int, int]:
    return tuple(int(hx[i:i + 2], 16) for i in (1, 3, 5))


def _blend(fg: str, bg: str, alpha: float) -> tuple[int, int, int]:
    f, b = _rgb(fg), _rgb(bg)
    return tuple(round(f[i] * alpha + b[i] * (1 - alpha)) for i in range(3))


def _bg_key(raw) -> str:
    if raw == "custom":
        return "custom"
    return raw if raw in BGS else "black"


def _bg_base(cfg: dict, bg_key: str) -> str:
    """Опорный цвет фона: от него считаются пустые точки и текст. Для своего
    цвета берём тот, что выбрал человек, иначе цвет темы."""
    if bg_key == "owncolor":
        own = str(cfg.get("bgColor") or "")
        if re.fullmatch(r"#[0-9a-fA-F]{6}", own):
            return own
    return BGS[bg_key]


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
    if bg_key == "owncolor":
        return Image.new("RGB", (W, H), _bg_base(cfg, bg_key))
    if bg_key == "custom":
        bg_id = cfg.get("bgImage", "")
        custom = _load_custom_bg(bg_id) if bg_id else None
        if custom:
            # та же вуаль, что в превью браузера: без неё точки тонут в светлом
            # снимке, а обои выходят светлее, чем человек видел на сайте
            veil = Image.new("RGB", custom.size, (0, 0, 0))
            return Image.blend(custom, veil, 0.12)
        return Image.new("RGB", (W, H), BGS["custom"])
    if bg_key in scenes.SCENES:
        return scenes.scene_image(bg_key).copy()
    bg = BGS[bg_key]
    img = Image.new("RGB", (W, H), bg)
    _paint_bg(img, bg_key, bg)
    return img


def _shape_points(shape: str, w: int, h: int, seed: int = 0) -> list[tuple[float, float]] | None:
    cx, cy = w / 2, h / 2
    d = min(w, h)
    if shape in scenes.NEW_SHAPES:
        return scenes.shape_pts(shape, 0, 0, d, seed)
    if shape == "diamond":
        r = d * 0.48
        return [(cx, cy - r), (cx + r, cy), (cx, cy + r), (cx - r, cy)]
    if shape == "hex":
        r = d * 0.48
        return [
            (cx + math.cos(-math.pi / 2 + i * math.pi / 3) * r,
             cy + math.sin(-math.pi / 2 + i * math.pi / 3) * r)
            for i in range(6)
        ]
    if shape == "star":
        r = d * 0.48
        pts = []
        for i in range(10):
            a = -math.pi / 2 + (i * math.pi) / 5
            rr = r * 0.42 if i % 2 else r
            pts.append((cx + math.cos(a) * rr, cy + math.sin(a) * rr))
        return pts
    if shape == "heart":
        pts = []
        for deg in range(0, 360, 15):
            t = math.radians(deg)
            hx = 16 * math.sin(t) ** 3
            hy = -(13 * math.cos(t) - 5 * math.cos(2 * t) - 2 * math.cos(3 * t) - math.cos(4 * t))
            pts.append((cx + hx * d * 0.032, cy + hy * d * 0.032 + d * 0.06))
        return pts
    return None


def _radial(w: int, h: int, cx: float, cy: float, radius: float,
            inner: int, outer: int) -> Image.Image:
    """Круглый градиент как маска прозрачности: inner в середине, outer к краю."""
    size = max(2, int(radius * 2))
    grad = ImageOps.invert(Image.radial_gradient("L")).resize((size, size), Image.BILINEAR)
    canvas = Image.new("L", (w, h), 0)
    canvas.paste(grad, (int(cx - radius), int(cy - radius)))
    return canvas.point(lambda v: int(outer + (inner - outer) * v / 255))


def _vertical(w: int, h: int, top_frac: float, inner: int, outer: int) -> Image.Image:
    """Тень снизу: ровный переход от прозрачного к outer у нижнего края."""
    band = max(2, int(h * (1 - top_frac)))
    grad = Image.linear_gradient("L").resize((w, band), Image.BILINEAR)
    canvas = Image.new("L", (w, h), inner)
    canvas.paste(grad.point(lambda v: int(inner + (outer - inner) * v / 255)), (0, h - band))
    return canvas


def _tint(w: int, h: int, rgb: tuple[int, int, int], alpha: Image.Image) -> Image.Image:
    layer = Image.new("RGBA", (w, h), rgb + (0,))
    layer.putalpha(alpha)
    return layer


def _glass_dot(img: Image.Image, box, color: str, shape: str, mode: str = "filled", seed: int = 0) -> None:
    """Точка «жидкое стекло»: блик, глубина, светлая кромка.

    Блики обязательно режутся по силуэту точки. Раньше они рисовались
    простыми эллипсами поверх слоя, и на звезде или сердце наружу вылезал
    круглый серый блин — в браузере этого не было видно, там canvas сам
    обрезает по clip(), и превью расходилось с обоями.
    """
    x0, y0, x1, y1 = int(box[0]), int(box[1]), int(box[2]), int(box[3])
    bw, bh = x1 - x0, y1 - y0
    if bw < 2:
        return
    # новые формы (ромашка, ёлка) выходят за коробку точки — слою нужен запас
    pad = int(bw * 0.12) if shape in scenes.NEW_SHAPES else 0
    x0, y0 = x0 - pad, y0 - pad
    w, h = bw + 2 * pad, bh + 2 * pad
    r, g, b = _rgb(color)
    rad = int(min(w, h) * 0.3) if shape == "rounded" else 0
    ib = (0, 0, w - 1, h - 1)
    shifted = None
    if pad:
        shifted = [(px + pad, py + pad) for px, py in _shape_points(shape, bw, bh, seed)]

    def paint(dr, fill=None, outline=None, width=0):
        poly = shifted if shifted is not None else _shape_points(shape, w, h)
        if poly is not None:
            if fill:
                dr.polygon(poly, fill=fill)
            if outline:
                dr.polygon(poly, outline=outline, width=width)
        elif shape == "circle":
            dr.ellipse(ib, fill=fill, outline=outline, width=width)
        elif shape == "square":
            dr.rectangle(ib, fill=fill, outline=outline, width=width)
        else:
            dr.rounded_rectangle(ib, radius=rad, fill=fill, outline=outline, width=width)

    silhouette = Image.new("L", (w, h), 0)
    paint(ImageDraw.Draw(silhouette), fill=255)

    layer = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    p = pad
    if mode == "empty":
        layer.alpha_composite(_tint(w, h, (255, 255, 255),
                                    _radial(w, h, p + bw * 0.28, p + bh * 0.22, bw * 0.78, 87, 12)))
    elif mode == "ring":
        layer.alpha_composite(_tint(w, h, (255, 255, 255),
                                    _radial(w, h, p + bw * 0.3, p + bh * 0.25, bw * 0.76, 66, 20)))
    else:
        layer.alpha_composite(_tint(w, h, (r, g, b), Image.new("L", (w, h), 198)))
        layer.alpha_composite(_tint(w, h, (255, 255, 255),
                                    _radial(w, h, p + bw * 0.18, p + bh * 0.14, bw * 0.82, 205, 0)))
        layer.alpha_composite(_tint(w, h, (0, 0, 0), _vertical(w, h, 0.42, 0, 56)))
        layer.alpha_composite(_tint(w, h, (255, 255, 255),
                                    _radial(w, h, p + bw * 0.35, p + bh * 0.28, bw * 0.28, 130, 0)))

    layer.putalpha(ImageChops.multiply(layer.getchannel("A"), silhouette))
    # кромка идёт по самому силуэту, её обрезать не нужно
    edge = ImageDraw.Draw(layer)
    if mode == "ring":
        paint(edge, outline=(r, g, b, 230), width=max(2, round(bw * 0.09)))
    elif mode == "empty":
        paint(edge, outline=(255, 255, 255, 82), width=max(1, round(bw * 0.06)))
    else:
        paint(edge, outline=(255, 255, 255, 118), width=max(1, round(bw * 0.065)))
    img.paste(layer, (x0, y0), layer)


def _new_shape_dot(img: Image.Image, box, color: str, shape: str, mode: str, bg_hex: str,
                   seed: int, empty_alpha: float | None) -> None:
    """Новые формы: многоугольник со сглаженным краем (canvas сглаживает сам)."""
    x0, y0, x1, _ = box
    d = x1 - x0
    pts = scenes.shape_pts(shape, x0, y0, d, seed)
    ss = 4
    xs, ys = [p[0] for p in pts], [p[1] for p in pts]
    bx, by = math.floor(min(xs)) - 2, math.floor(min(ys)) - 2
    bw, bh = math.ceil(max(xs)) - bx + 3, math.ceil(max(ys)) - by + 3
    local = [((px - bx) * ss, (py - by) * ss) for px, py in pts]
    m = Image.new("L", (bw * ss, bh * ss), 0)
    md = ImageDraw.Draw(m)
    if mode == "ring":
        # полоса внутри силуэта — как clip + stroke в canvas
        md.polygon(local, outline=255, width=max(2, round(d * 0.09)) * ss)
    else:
        md.polygon(local, fill=255)
    m = m.resize((bw, bh), Image.BOX)
    if mode == "empty":
        if empty_alpha is None:
            fill = _blend(color, bg_hex, 0.18)
        else:
            fill = _rgb(color)
            m = m.point(lambda v: int(v * empty_alpha + 0.5))
    else:
        fill = _rgb(color)
    img.paste(Image.new("RGB", (bw, bh), fill), (bx, by), m)


def _flower_center(img: Image.Image, box, color: str, shape: str, mode: str, bg_hex: str,
                   empty_alpha: float | None) -> None:
    x0, y0, x1, _ = box
    c = scenes.shape_center(shape, x0, y0, x1 - x0)
    if c is None:
        return
    accent = scenes.DAISY_CENTER if shape == "daisy" else scenes.sakura_center_color(color)
    if mode == "empty":
        if empty_alpha is None:
            scenes.stamp_circle(img, c[0], c[1], c[2], "#%02x%02x%02x" % _blend(accent, bg_hex, 0.18))
        else:
            scenes.stamp_circle(img, c[0], c[1], c[2], accent, min(1.0, empty_alpha + 0.1))
    else:
        scenes.stamp_circle(img, c[0], c[1], c[2], accent)


def _classic_dot(img: Image.Image, box, color: str, shape: str, mode: str, bg_hex: str,
                 empty_alpha: float | None = None) -> None:
    """Оригинальные точки: заливка цветом, пустые — blend(color, bg, 0.18), кольцо — обводка.
    На сценах-темах пустые — цвет точки с прозрачностью empty_alpha поверх картинки."""
    x0, y0, x1, y1 = int(box[0]), int(box[1]), int(box[2]), int(box[3])
    w, h = x1 - x0, y1 - y0
    if w < 2:
        return
    if mode == "empty" and empty_alpha is not None:
        m = Image.new("L", (w * 4, h * 4), 0)
        md = ImageDraw.Draw(m)
        poly = _shape_points(shape, w * 4, h * 4)
        if poly is not None:
            md.polygon(poly, fill=255)
        elif shape == "circle":
            md.ellipse((0, 0, w * 4 - 1, h * 4 - 1), fill=255)
        elif shape == "square":
            md.rectangle((0, 0, w * 4 - 1, h * 4 - 1), fill=255)
        else:
            md.rounded_rectangle((0, 0, w * 4 - 1, h * 4 - 1), radius=int(min(w, h) * 1.2), fill=255)
        m = m.resize((w, h), Image.BOX).point(lambda v: int(v * empty_alpha + 0.5))
        img.paste(Image.new("RGB", (w, h), _rgb(color)), (x0, y0), m)
        return
    d = ImageDraw.Draw(img)
    empty = _blend(color, bg_hex, 0.18)
    col = _rgb(color)
    rad = int(min(w, h) * 0.3) if shape == "rounded" else 0
    ib = (x0, y0, x1 - 1, y1 - 1)
    lw, lh = w, h

    def shape_draw(fill=None, outline=None, width=0):
        poly = _shape_points(shape, lw, lh)
        if poly is not None:
            shifted = [(x0 + px, y0 + py) for px, py in poly]
            if fill is not None:
                d.polygon(shifted, fill=fill)
            if outline is not None:
                d.polygon(shifted, outline=outline, width=width)
        elif shape == "circle":
            d.ellipse(ib, fill=fill, outline=outline, width=width)
        elif shape == "square":
            d.rectangle(ib, fill=fill, outline=outline, width=width)
        else:
            d.rounded_rectangle(ib, radius=rad, fill=fill, outline=outline, width=width)

    if mode == "empty":
        shape_draw(empty)
    elif mode == "ring":
        shape_draw(None, col, max(2, round(w * 0.09)))
    else:
        shape_draw(col)


def _dot(img: Image.Image, box, color: str, shape: str, mode: str, glass: bool, bg_hex: str,
         i: int = 0, empty_alpha: float | None = None) -> None:
    """Одна точка сетки. i — номер точки: у кляксы свой неровный край."""
    if shape == "tone":
        scenes.tone_dot(img, box[0], box[1], box[2] - box[0], color, scenes.tone_ink(bg_hex, color), mode)
        return
    if shape == "ink" and mode == "ring":
        # «сегодня» у туши — энсо, круг одним мазком
        d = box[2] - box[0]
        scenes.enso(img, (box[0] - d * 0.08, box[1] - d * 0.08, box[2] + d * 0.08, box[3] + d * 0.08),
                    color, seed=i + 3)
        return
    if glass:
        _glass_dot(img, box, color, shape, mode, seed=i)
    elif shape in scenes.NEW_SHAPES:
        _new_shape_dot(img, box, color, shape, mode, bg_hex, i, empty_alpha)
    else:
        _classic_dot(img, box, color, shape, mode, bg_hex, empty_alpha)
    _flower_center(img, box, color, shape, mode, bg_hex, empty_alpha)


def _star(draw: ImageDraw.ImageDraw, cx: float, cy: float, r: float, fill) -> None:
    pts = []
    for i in range(10):
        a = -math.pi / 2 + (i * math.pi) / 5
        rr = r * 0.42 if i % 2 else r
        pts.append((cx + math.cos(a) * rr, cy + math.sin(a) * rr))
    draw.polygon(pts, fill=fill)


def _crescent(img: Image.Image, cx: int, cy: int, r: int, fill_rgb: tuple[int, int, int]) -> None:
    size = int(r * 2.8)
    layer = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    pad = int(r * 0.4)
    ld = ImageDraw.Draw(layer)
    ld.ellipse((pad, pad, pad + 2 * r, pad + 2 * r), fill=fill_rgb + (225,))
    mask = Image.new("L", (size, size), 0)
    md = ImageDraw.Draw(mask)
    md.ellipse((pad, pad, pad + 2 * r, pad + 2 * r), fill=255)
    md.ellipse((pad + int(r * 0.62), pad - int(r * 0.12), pad + int(r * 0.62) + int(r * 1.7), pad - int(r * 0.12) + int(r * 1.7)), fill=0)
    layer.putalpha(mask)
    img.paste(layer, (int(cx - r - pad), int(cy - r - pad)), layer)


def _lantern(draw: ImageDraw.ImageDraw, x: int, y: int, base: str) -> None:
    w, h = 72, 96
    draw.line(((x, y - 72), (x, y - 6)), fill=_blend("#b8942e", base, 0.55), width=3)
    body = _blend("#f5e6b8", base, 0.9)
    draw.rounded_rectangle((x - w // 2, y, x + w // 2, y + h), radius=10, fill=body)
    draw.pieslice((x - w // 2, y - w // 2, x + w // 2, y + w // 2), 180, 0, fill=body)
    glow = _blend("#f5e6b8", base, 0.28)
    draw.polygon([(x - int(w * 0.35), y + h), (x, y + h + 70), (x + int(w * 0.35), y + h)], fill=glow)


def _pine(draw: ImageDraw.ImageDraw, x: int, base_h: int, h: int, fill: str) -> None:
    draw.polygon([(x, base_h - h), (x - h * 0.34, base_h - h * 0.42), (x + h * 0.34, base_h - h * 0.42)], fill=fill)
    draw.polygon([(x, base_h - h * 0.62), (x - h * 0.28, base_h - h * 0.16), (x + h * 0.28, base_h - h * 0.16)], fill=fill)
    draw.rectangle((x - h * 0.07, base_h - h * 0.14, x + h * 0.07, base_h), fill=fill)


def _paint_bg(img: Image.Image, key: str, base: str) -> None:
    """Сцена-фон: вертикальный градиент + силуэты (горы/океан/закат). Для сплошных — no-op."""
    if key in scenes.SCENES:
        img.paste(scenes.scene_image(key))
        return
    draw = ImageDraw.Draw(img)
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
        for y in range(int(H * 0.52), int(H * 0.82)):
            t = (y - H * 0.52) / (H * 0.3)
            col = _blend("#c8a86a", base, 0.2 * (1 - t))
            draw.line(((0, y), (W, y)), fill=col)
        for x, y, r in ((110, 170, 2), (260, 130, 1.8), (420, 210, 2.2), (640, 150, 1.6),
                        (860, 190, 2), (1020, 120, 1.7), (1120, 240, 1.5)):
            draw.ellipse((x - r, y - r, x + r, y + r), fill=_blend("#e8e4c8", base, 0.62))
        _star(draw, 195, 370, 40, _blend("#e8d890", base, 0.72))
        _star(draw, 1010, 255, 16, _blend("#d4cfa0", base, 0.5))
        draw.polygon([(0, 2556), (0, 2490), (220, 2490), (220, 2410), (310, 2350), (400, 2410),
                      (400, 2490), (580, 2490), (580, 2430), (680, 2370), (780, 2430), (780, 2490),
                      (1179, 2490), (1179, 2556)], fill="#1c2416")
        for bx, by, bh in ((95, 2490, 110), (720, 2490, 95), (980, 2490, 88)):
            draw.rectangle((bx, by - bh, bx + 130, by), fill="#222a18")
            for wy in range(by - bh + 22, by - 14, 28):
                for wx in range(bx + 18, bx + 108, 34):
                    draw.rectangle((wx, wy, wx + 16, wy + 12), fill=_blend("#f0d878", base, 0.55))
        _pine(draw, 55, 2490, 130, "#182010")
        _pine(draw, 1120, 2490, 150, "#161e10")
        _pine(draw, 890, 2490, 115, "#1a2214")
        draw.line(((0, 2518), (W, 2518)), fill=_blend("#5a6a38", base, 0.35), width=3)
        for i in range(9):
            x1, x2 = 80 + i * 128, 160 + i * 128
            draw.line(((x1, 2540), (x2, 2540)), fill=_blend("#4a5a30", base, 0.22), width=5)
        draw.polygon([(940, 2556), (970, 2320), (1000, 2320), (1030, 2556)], fill="#141a0e")
    elif key == "ramadan":
        for x, y, r in ((90, 160, 1.8), (240, 120, 1.4), (390, 200, 1.6), (540, 95, 1.3), (700, 170, 1.7),
                        (850, 130, 1.5), (1000, 210, 1.6), (180, 320, 1.3), (320, 280, 1.2), (620, 340, 1.4),
                        (1080, 320, 1.5)):
            draw.ellipse((x - r, y - r, x + r, y + r), fill=_blend("#f5e6b8", base, 0.78))
        _crescent(img, 930, 340, 62, _blend("#f5e6b8", base, 0.9))
        _lantern(draw, 210, 520, base)
        _lantern(draw, 980, 560, base)
        draw.rectangle((0, 2510, W, 2556), fill="#080c18")
        draw.rectangle((420, 2440, 760, 2556), fill="#0a0e1c")
        draw.pieslice((472, 2368, 708, 2440), 180, 0, fill="#0a0e1c")
        draw.rectangle((455, 2440, 503, 2556), fill="#0a0e1c")
        draw.polygon([(467, 2440), (479, 2440), (491, 2280), (467, 2280)], fill="#0a0e1c")
        draw.polygon([(467, 2280), (479, 2250), (491, 2280)], fill="#0a0e1c")
        draw.rectangle((677, 2460, 715, 2556), fill="#0a0e1c")
        draw.polygon([(686, 2320), (696, 2295), (706, 2320)], fill="#0a0e1c")
        draw.ellipse((548, 2462, 632, 2538), fill=_blend("#f5e6b8", base, 0.18))
        draw.ellipse((560, 2474, 620, 2526), fill="#0a0e1c")
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


def _watermark(draw: ImageDraw.ImageDraw, cx: float, cy: float, fill, font_key: str = "") -> None:
    """Мини-логотип: 6 точек + «vita» (вирусный штамп на бесплатных обоях)."""
    font = _title_font(32, font_key)
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
    bg = _bg_base(goal, bg_key)
    color = goal.get("color") or "#34c759"
    if not re.fullmatch(r"#[0-9a-fA-F]{6}", color):
        color = "#34c759"
    shape = goal.get("shape", "circle")
    # заголовок рисуем ровно так, как его набрали: капс больше не навязываем
    title = (goal.get("title") or "").strip()
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
        _paint_bg(img, bg_key, bg)
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

    empty_alpha = scenes.EMPTY_ALPHA.get(bg_key)
    for i in range(days):
        r, c = divmod(i, cols)
        x, y = x0 + c * (dot + gap), y0 + r * (dot + gap)
        box = (x, y, x + dot, y + dot)
        if i in done_idx:
            _dot(img, box, color, shape, "filled", False, bg, i, empty_alpha)
        elif i == today_idx:
            _dot(img, box, color, shape, "ring", False, bg, i, empty_alpha)
        else:
            _dot(img, box, color, shape, "empty", False, bg, i, empty_alpha)

    if title:
        _draw_title(img, draw, title, y0 - 190, goal.get("font", ""), color)
    _watermark(draw, W / 2, y0 - 110, text, goal.get("font", ""))
    footer = f"{done_count} из {days} · стрик {streak}"
    if done_count >= days:
        footer = "цель закрыта · 🎁 забирай награду"
    draw_text(img, draw, (W / 2, y0 + grid_h + 130), footer,
              _title_font(40, goal.get("font", "")), text)
    return img


def _hex(value, fallback: str | None = None) -> str | None:
    value = str(value or "")
    return value if re.fullmatch(r"#[0-9a-fA-F]{6}", value) else fallback


def render_wallpaper(cfg: dict, today: date | None = None, expired: bool = False) -> Image.Image:
    today = today or date.today()
    mode = cfg.get("mode") if cfg.get("mode") in MODES else "month"
    bg_key = _bg_key(cfg.get("bg", ""))
    bg = _bg_base(cfg, bg_key)
    color = cfg.get("color") or "#f2f2f2"
    if not re.fullmatch(r"#[0-9a-fA-F]{6}", color):
        color = "#f2f2f2"
    shape = cfg.get("shape", "circle")
    glass = cfg.get("glass", False)
    glow = bool(cfg.get("glow", False))
    title = (cfg.get("title") or "").strip()
    empty_alpha = scenes.EMPTY_ALPHA.get(bg_key)

    # цвета текста задаёт тема; без темы заголовок — цветом точек, остальное серым
    text = _hex(cfg.get("textMuted")) or ("#8a857a" if bg_key == "white" else "#8e8e8e")
    title_fill = _hex(cfg.get("textColor")) or color
    stroke = _hex(cfg.get("textStroke"))

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

    # свечение — мягкий ореол под закрашенными точками; на крошечных точках
    # «Жизни» его не видно, и превью бы на нём захлебнулось
    glow_on = glow and dot >= 14
    for i in range(total):
        r, c = divmod(i, cols)
        x, y = x0 + c * (dot + gap), y0 + r * (dot + gap)
        box = (x, y, x + dot, y + dot)
        if i < done:
            if glow_on:
                scenes.glow(img, x, y, dot, color)
            _dot(img, box, color, shape, "filled", glass, bg, i, empty_alpha)
        elif current is not None and i == current:
            _dot(img, box, color, shape, "ring", glass, bg, i, empty_alpha)
        else:
            _dot(img, box, color, shape, "empty", glass, bg, i, empty_alpha)

    draw = ImageDraw.Draw(img)
    if title:
        _draw_title(img, draw, title, y0 - 190, cfg.get("font", ""), title_fill, stroke)
    font_key = cfg.get("font", "")
    if cfg.get("brand", True):
        _watermark(draw, W / 2, y0 - 110, text, font_key)
    if expired:
        # доступ кончился: прогресс заморожен (today = дата окончания), обои сами напоминают
        draw.text((W / 2, y0 + grid_h + 130), "точки замерли · vitadots.ru",
                  font=_title_font(40, font_key), fill=title_fill, anchor="mm")
    elif cfg.get("footer", True):
        draw.text(
            (W / 2, y0 + grid_h + 130),
            _footer(mode, total, done),
            font=_title_font(40, font_key),
            fill=text,
            anchor="mm",
        )
    return img
