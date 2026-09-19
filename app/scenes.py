"""Темы-сцены для обоев: шесть фонов и новые формы точек.

Пара — static/scenes.js: каждый шаг тут повторён там в том же порядке, иначе
превью разойдётся с обоями. Случайность — mulberry32 по зерну, одинаковая в
Python и JS. Всё собрано из того, что canvas умеет так же: вертикальные
градиенты, мягкие пятна (радиальный градиент), многоугольники и линии.
Размытия нет — ctx.filter в Safari не работает.

Штрихи (трава, хвоя, зерно, блики) рисуются непрозрачными, пятна и холмы —
с прозрачностью поверх. Так было на макетах, которые владелец одобрил 19.09.
"""
from __future__ import annotations

import math
from collections import OrderedDict

from PIL import Image, ImageChops, ImageDraw

W, H = 1179, 2556
TAU = 6.283  # так в макетах — число то же и в scenes.js

SCENES = ("pole", "romashki", "taiga", "tush", "manga", "tuman")
# опорный цвет сцены: по нему считают контраст свотчей и пустые точки
SCENE_BASE = {
    "pole": "#c4e0f5", "romashki": "#1a2517", "taiga": "#172017",
    "tush": "#0b0b0a", "manga": "#6e6e6e", "tuman": "#262e30",
}
# пустые точки на сценах — цветом точки с этой прозрачностью поверх картинки,
# а не сплошной смесью с опорным цветом: картинка под ними разная
EMPTY_ALPHA = {"pole": 0.24, "romashki": 0.14, "taiga": 0.18, "tush": 0.14, "manga": 0.22, "tuman": 0.2}

DAISY_CENTER = "#e8b92f"


# ---------------------------------------------------------------- основа

def rng(seed: int):
    """mulberry32. В scenes.js — тот же генератор, числа совпадают до бита."""
    a = seed & 0xFFFFFFFF

    def nxt() -> float:
        nonlocal a
        a = (a + 0x6D2B79F5) & 0xFFFFFFFF
        t = ((a ^ (a >> 15)) * (a | 1)) & 0xFFFFFFFF
        t = ((t + (((t ^ (t >> 7)) * (t | 61)) & 0xFFFFFFFF)) & 0xFFFFFFFF) ^ t
        return ((t ^ (t >> 14)) & 0xFFFFFFFF) / 4294967296

    return nxt


def rgb(hx: str) -> tuple[int, int, int]:
    return tuple(int(hx[i:i + 2], 16) for i in (1, 3, 5))


def mix(a: str, b: str, t: float) -> tuple[int, int, int]:
    x, y = rgb(a), rgb(b)
    return tuple(round(x[i] + (y[i] - x[i]) * t) for i in range(3))


def hexs(c: tuple[int, int, int]) -> str:
    return "#%02x%02x%02x" % c


def vgrad(stops, w: int = W, h: int = H) -> Image.Image:
    """Вертикальный градиент [(цвет, 0..1), ...] — как createLinearGradient."""
    col = Image.new("RGB", (1, h))
    px = col.load()
    for y in range(h):
        t = y / (h - 1)
        c = rgb(stops[-1][0])
        if t <= stops[0][1]:
            c = rgb(stops[0][0])
        else:
            for (c1, p1), (c2, p2) in zip(stops, stops[1:]):
                if t <= p2:
                    f = 0.0 if p2 == p1 else (t - p1) / (p2 - p1)
                    c = mix(c1, c2, f)
                    break
        px[0, y] = c
    return col.resize((w, h), Image.NEAREST)


# У PIL radial_gradient 255 стоит в углу квадрата, а на радиусе — 181. Без
# этой поправки у мягких пятен вылезали квадратные края.
_RAD = Image.radial_gradient("L")


def _radial_mask(r: float, stops) -> Image.Image:
    size = max(2, int(r * 2))
    lut = []
    for v in range(256):
        t = min(1.0, v / 181)
        a = stops[-1][1]
        for (p1, a1), (p2, a2) in zip(stops, stops[1:]):
            if t <= p2:
                f = 0 if p2 == p1 else (t - p1) / (p2 - p1)
                a = a1 + (a2 - a1) * f
                break
        lut.append(int(max(0, min(255, a))))
    return _RAD.resize((size, size), Image.BILINEAR).point(lut)


def blob(img: Image.Image, cx, cy, r, color, alpha=255, stops=None, sx=1.0, sy=1.0) -> None:
    """Мягкое пятно: радиальный градиент прозрачности (можно сплюснуть)."""
    stops = stops or [(0, alpha), (0.55, alpha * 0.45), (1, 0)]
    m = _radial_mask(r, stops)
    if sx != 1.0 or sy != 1.0:
        m = m.resize((max(2, int(m.width * sx)), max(2, int(m.height * sy))), Image.BILINEAR)
    img.paste(Image.new("RGB", m.size, rgb(color)),
              (int(round(cx - m.width / 2)), int(round(cy - m.height / 2))), m)


def _poly_mask(points, ss: int = 2) -> Image.Image:
    """Маска многоугольника на весь кадр со сглаженным краем (canvas сглаживает сам)."""
    m = Image.new("L", (W * ss, H * ss), 0)
    ImageDraw.Draw(m).polygon([(x * ss, y * ss) for x, y in points], fill=255)
    return m.resize((W, H), Image.BOX) if ss > 1 else m


def grad_poly(img: Image.Image, points, top: str, bot: str, y_top: float, y_bot: float) -> None:
    """Многоугольник, залитый вертикальным градиентом; за пределами полосы —
    крайние цвета (без этого по гребню вылезали чёрные клинья)."""
    full = Image.new("RGB", (W, H), rgb(bot))
    if y_top > 0:
        full.paste(Image.new("RGB", (W, int(y_top)), rgb(top)), (0, 0))
    full.paste(vgrad([(top, 0), (bot, 1)], W, max(2, int(y_bot - y_top))), (0, int(y_top)))
    img.paste(full, (0, 0), _poly_mask(points))


def ridge(y0, amp, seed, parts, step=6):
    """Линия холма: сумма синусов с фазами от зерна."""
    r = rng(seed)
    ph = [r() * TAU for _ in parts]
    return [(x, y0 + amp * sum(a * math.sin(x * f * 3 + p) for (f, a), p in zip(parts, ph)))
            for x in range(-10, W + 11, step)]


def stamp_poly(img: Image.Image, points, color, alpha=1.0, ss=4) -> None:
    """Небольшой многоугольник со сглаженным краем и прозрачностью."""
    xs = [p[0] for p in points]
    ys = [p[1] for p in points]
    x0, y0 = math.floor(min(xs)) - 1, math.floor(min(ys)) - 1
    w, h = math.ceil(max(xs)) - x0 + 2, math.ceil(max(ys)) - y0 + 2
    if w < 1 or h < 1:
        return
    m = Image.new("L", (w * ss, h * ss), 0)
    ImageDraw.Draw(m).polygon([((x - x0) * ss, (y - y0) * ss) for x, y in points], fill=255)
    m = m.resize((w, h), Image.BOX)
    if alpha < 1:
        m = m.point(lambda v: int(v * alpha + 0.5))
    img.paste(Image.new("RGB", (w, h), rgb(color)), (x0, y0), m)


def stamp_circle(img: Image.Image, cx, cy, rad, color, alpha=1.0, ss=4) -> None:
    n = max(24, int(rad * 1.5))
    stamp_poly(img, [(cx + math.cos(k / n * math.tau) * rad, cy + math.sin(k / n * math.tau) * rad)
                     for k in range(n)], color, alpha, ss)


# ---------------------------------------------------------------- формы точек
# Все новые формы — многоугольники в коробке точки (x, y, d). Те же точки
# считает dotPath в app.js через VitaScenes.shape — так стекло, кольцо «сегодня»
# и пустые точки работают для них так же, как для старых.

def daisy_pts(cx, cy, d, rot=0.0, petals=13, wid=0.8, rc=0.16, rt=0.47, steps=16):
    """Ромашка: лепестки по кругу — радиус как функция угла."""
    n = petals * steps
    sector = math.tau / petals
    out = []
    for j in range(n):
        th = j / n * math.tau
        s = (th - rot) / sector
        phi = 2 * (s - math.floor(s + 0.5))
        g = max(0.0, 1 - (phi / wid) ** 2) ** 0.5
        rr = d * (rc + (rt - rc) * g)
        out.append((cx + math.cos(th) * rr, cy + math.sin(th) * rr))
    return out


def sakura_pts(cx, cy, d, rot=-math.pi / 2):
    """Сакура: пять круглых лепестков с выемкой на кончике."""
    n = 5 * 24
    sector = math.tau / 5
    out = []
    for j in range(n):
        th = j / n * math.tau
        s = (th - rot) / sector
        phi = 2 * (s - math.floor(s + 0.5))
        lobe = max(0.0, 1 - phi * phi) ** 0.5
        notch = 0.2 * max(0.0, 1 - abs(phi) / 0.16)
        rr = d * (0.1 + 0.39 * (lobe - notch))
        out.append((cx + math.cos(th) * rr, cy + math.sin(th) * rr))
    return out


def fir_pts(x, y, d):
    """Ёлочка: три яруса и ствол, чуть выше коробки точки."""
    w, h = d * 0.92, d * 1.08
    ox, oy = x + (d - w) / 2, y + (d - h) / 2
    cx = w / 2
    tiers = ((0.36, 0.28), (0.60, 0.37), (0.85, 0.47))
    right = [(cx, 0.0)]
    for i, (bot, half) in enumerate(tiers):
        right.append((cx + half * w, bot * h))
        if i < len(tiers) - 1:
            right.append((cx + half * w * 0.45, bot * h - 0.015 * h))
    trunk = [(cx + 0.075 * w, 0.85 * h), (cx + 0.075 * w, h), (cx - 0.075 * w, h), (cx - 0.075 * w, 0.85 * h)]
    left = [(2 * cx - px, py) for px, py in reversed(right[1:])]
    return [(ox + px, oy + py) for px, py in right + trunk + left]


def leaf_pts(cx, cy, d):
    """Листик: острые кончики, лежит наискось."""
    L, hw = d * 0.49, d * 0.27
    rot = -math.pi / 4
    out = []
    n = 24
    for k in range(n + 1):
        u = -1 + 2 * k / n
        out.append((u * L, -hw * (1 - u * u) ** 0.85))
    for k in range(n - 1, 0, -1):
        u = -1 + 2 * k / n
        out.append((u * L, hw * (1 - u * u) ** 0.85))
    c, s = math.cos(rot), math.sin(rot)
    return [(cx + px * c - py * s, cy + px * s + py * c) for px, py in out]


def drop_pts(x, y, d):
    """Капля: острый кончик сверху, круглое дно."""
    cx, cy, r = x + d * 0.5, y + d * 0.62, d * 0.35
    tip = (cx, y + d * 0.02)
    alpha = math.asin(r / (cy - tip[1]))
    # касательные из кончика к кругу; дуга идёт по низу справа налево
    a0, a1 = -alpha, math.pi + alpha
    n = 36
    return [tip] + [(cx + math.cos(a0 + (a1 - a0) * k / n) * r, cy + math.sin(a0 + (a1 - a0) * k / n) * r)
                    for k in range(n + 1)]


def moon_pts(x, y, d):
    """Полумесяц рожками вправо: большой круг минус сдвинутый."""
    c1x, c1y, r1 = x + d * 0.5, y + d * 0.5, d * 0.46
    c2x, c2y, r2 = c1x + d * 0.2, c1y - d * 0.09, d * 0.39
    dx, dy = c2x - c1x, c2y - c1y
    dist = math.hypot(dx, dy)
    base = math.atan2(dy, dx)
    b1 = math.acos((r1 * r1 - r2 * r2 + dist * dist) / (2 * dist * r1))
    b2 = math.acos((r2 * r2 - r1 * r1 + dist * dist) / (2 * dist * r2))
    n = 40
    # внешняя дуга — дальняя от выреза сторона, внутренняя — край выреза
    outer_from, outer_to = base + b1, base + math.tau - b1
    inner_from, inner_to = base + math.pi + b2, base + math.pi - b2
    pts = [(c1x + math.cos(outer_from + (outer_to - outer_from) * k / n) * r1,
            c1y + math.sin(outer_from + (outer_to - outer_from) * k / n) * r1) for k in range(n + 1)]
    pts += [(c2x + math.cos(inner_from + (inner_to - inner_from) * k / n) * r2,
             c2y + math.sin(inner_from + (inner_to - inner_from) * k / n) * r2) for k in range(1, n)]
    return pts


def ink_pts(x, y, d, seed, rough=0.07):
    """Клякса туши: круг с неровным краем, у каждой точки своя."""
    r = rng(seed)
    amps = [(r() - 0.5) * 2 for _ in range(6)]
    phs = [r() * TAU for _ in range(6)]
    cx, cy = x + d / 2, y + d / 2
    rad = d * 0.47
    out = []
    for i in range(40):
        a = i / 40 * TAU
        k = 1 + rough * sum(amps[j] * math.sin((j + 2) * a + phs[j]) for j in range(6)) / 2.2
        k += (r() - 0.5) * rough * 0.5
        out.append((cx + math.cos(a) * rad * k, cy + math.sin(a) * rad * k))
    return out


NEW_SHAPES = ("daisy", "sakura", "fir", "leaf", "drop", "moon", "ink", "tone")


def shape_pts(shape: str, x, y, d, i: int = 0):
    """Многоугольник новой формы в коробке (x, y, d); None — рисовать кругом."""
    if shape == "daisy":
        return daisy_pts(x + d / 2, y + d / 2, d * 1.16, rot=math.radians((i * 37) % 360))
    if shape == "sakura":
        return sakura_pts(x + d / 2, y + d / 2, d * 1.06)
    if shape == "fir":
        return fir_pts(x, y, d)
    if shape == "leaf":
        return leaf_pts(x + d / 2, y + d / 2, d)
    if shape == "drop":
        return drop_pts(x, y, d)
    if shape == "moon":
        return moon_pts(x, y, d)
    if shape == "ink":
        return ink_pts(x, y, d, 1000 + i)
    return None


def shape_center(shape: str, x, y, d):
    """Серединка цветка: (cx, cy, радиус) или None."""
    if shape == "daisy":
        return x + d / 2, y + d / 2, d * 1.16 * 0.15
    if shape == "sakura":
        return x + d / 2, y + d / 2, d * 0.1
    return None


def sakura_center_color(color: str) -> str:
    return hexs(mix(color, "#7a2745", 0.45))


def enso(img: Image.Image, box, color, width_k=0.13, seed=7, alpha=1.0,
         start=-1.25, span=5.55, s=4) -> None:
    """Энсо — круг одним мазком кисти: разрыв, к концу сужается и сохнет."""
    x0, y0, x1, _ = box
    w = x1 - x0
    D = int(w * s)
    m = Image.new("L", (D, D), 0)
    md = ImageDraw.Draw(m)
    c = D / 2
    rad = D * 0.40
    r = rng(seed)
    steps = max(90, int(D / 18))
    for k in range(steps):
        t = k / (steps - 1)
        a = start + span * t
        rr = rad * (1 + 0.035 * math.sin(a * 3 + 1.3))
        wid = D * width_k * (0.55 + 0.6 * math.sin(math.pi * min(1, t * 1.15)) ** 0.7) * (1 - 0.75 * t ** 3)
        px, py = c + math.cos(a) * rr, c + math.sin(a) * rr
        md.ellipse((px - wid / 2, py - wid / 2, px + wid / 2, py + wid / 2), fill=255)
    dry = Image.new("L", (D, D), 0)
    dd = ImageDraw.Draw(dry)
    for _ in range(7):
        off = (r() - 0.5) * D * width_k * 0.9
        a0 = start + span * (0.55 + r() * 0.35)
        a1 = start + span
        pts = [(c + math.cos(a0 + (a1 - a0) * j / 29) * (rad + off),
                c + math.sin(a0 + (a1 - a0) * j / 29) * (rad + off)) for j in range(30)]
        dd.line(pts, fill=255, width=max(2, int(D * 0.012)))
    m = ImageChops.subtract(m, dry).resize((int(w), int(w)), Image.LANCZOS)
    if alpha < 1:
        m = m.point(lambda v: int(v * alpha + 0.5))
    img.paste(Image.new("RGB", m.size, rgb(color)), (int(round(x0)), int(round(y0))), m)


def tone_dot(img: Image.Image, x, y, d, color, ink, mode, ss=4) -> None:
    """Точка-манга: белая в чёрной обводке, будущие — растром (скринтон)."""
    D = int(round(d * ss))
    di = int(round(d))

    def put(mask, col, a=1.0):
        mask = mask.resize((di, di), Image.BOX)
        if a < 1:
            mask = mask.point(lambda v: int(v * a + 0.5))
        img.paste(Image.new("RGB", (di, di), rgb(col)), (int(round(x)), int(round(y))), mask)

    if mode == "filled":
        m = Image.new("L", (D, D), 0)
        ImageDraw.Draw(m).ellipse((0, 0, D - 1, D - 1), fill=255)
        put(m, ink)
        k = round(D * 0.075)
        m2 = Image.new("L", (D, D), 0)
        ImageDraw.Draw(m2).ellipse((k, k, D - 1 - k, D - 1 - k), fill=255)
        put(m2, color)
    elif mode == "ring":
        m = Image.new("L", (D, D), 0)
        ImageDraw.Draw(m).ellipse((0, 0, D - 1, D - 1), outline=255, width=round(D * 0.12))
        put(m, color)
        k = round(D * 0.12)
        m2 = Image.new("L", (D, D), 0)
        ImageDraw.Draw(m2).ellipse((k, k, D - 1 - k, D - 1 - k), outline=255, width=round(D * 0.05))
        put(m2, ink)
    else:
        m = Image.new("L", (D, D), 0)
        md = ImageDraw.Draw(m)
        step = D / 7.5
        rr = step * 0.26
        for yy in range(-1, 9):
            for xx in range(-1, 9):
                cx = xx * step + (step / 2 if yy % 2 else 0)
                cy = yy * step
                md.ellipse((cx - rr, cy - rr, cx + rr, cy + rr), fill=255)
        circ = Image.new("L", (D, D), 0)
        ImageDraw.Draw(circ).ellipse((0, 0, D - 1, D - 1), fill=255)
        m = ImageChops.multiply(m, circ)
        ImageDraw.Draw(m).ellipse((0, 0, D - 1, D - 1), outline=255, width=round(D * 0.03))
        put(m, ink, 0.82)


def tone_ink(bg_hex: str, color: str) -> str:
    """Тушь для растра: чёрная на светлом фоне, на тёмном — приглушённый цвет точки."""
    r_, g_, b_ = rgb(bg_hex)
    lum = (0.2126 * r_ + 0.7152 * g_ + 0.0722 * b_) / 255
    return "#111111" if lum > 0.25 else hexs(mix(bg_hex, color, 0.45))


def glow(img: Image.Image, x, y, d, color) -> None:
    """Свечение под точкой — мягкий ореол её же цвета."""
    blob(img, x + d / 2, y + d / 2, d * 0.95, color, stops=[(0, 110), (0.45, 60), (1, 0)])


# ---------------------------------------------------------------- сцены

def _cumulus(img, r, skyline, base_y, n, lit="#ffffff", shade="#c2d2e1", rmin=60, rmax=170):
    lumps = []
    for _ in range(n):
        cx = -120 + r() * (W + 240)
        top = skyline(cx)
        if top >= base_y:
            continue
        rr = rmin + r() * (rmax - rmin)
        cy = top + rr * 0.7 + r() * max(1, base_y - top - rr * 0.7)
        lumps.append((cx, cy, rr))
    for cx, cy, rr in lumps:
        blob(img, cx, cy + rr * 0.32, rr * 1.05, shade, stops=[(0, 170), (0.6, 120), (1, 0)])
    for cx, cy, rr in sorted(lumps, key=lambda t: -t[1]):
        blob(img, cx, cy, rr, lit, stops=[(0, 255), (0.55, 235), (0.82, 150), (1, 0)])


def _pole(img):
    img.paste(vgrad([("#74ade2", 0), ("#97c5ee", 0.28), ("#c4e0f5", 0.58), ("#e4f0f6", 0.77)]))
    blob(img, 150, 220, 1050, "#ffffff", stops=[(0, 130), (0.5, 55), (1, 0)])
    r = rng(161)
    for _ in range(18):
        blob(img, -80 + r() * 600, 610 + r() * 280, 55 + r() * 70, "#ffffff", 70 + r() * 50, sx=2.4, sy=0.6)

    def sky(x):
        return 1640 - 230 * math.exp(-((x - 800) / 300) ** 2) - 140 * math.exp(-((x - 230) / 240) ** 2)

    _cumulus(img, r, sky, 2010, 150)
    blob(img, W / 2, 1990, 900, "#eef6f9", 150, sx=1.5, sy=0.18)
    far = ridge(1990, 24, 5, ((0.0016, 1.0), (0.0041, 0.5), (0.009, 0.15)))
    grad_poly(img, far + [(W + 10, H), (-10, H)], "#a9c68c", "#86a86a", 1950, 2150)
    mid = ridge(2085, 40, 11, ((0.0012, 1.0), (0.0035, 0.35), (0.008, 0.12)))
    grad_poly(img, mid + [(W + 10, H), (-10, H)], "#8ab356", "#557f2f", 2030, 2300)
    blob(img, 330, 2110, 300, "#c9df8f", 70, sx=1.6, sy=0.35)
    near = ridge(2245, 66, 23, ((0.001, 1.0), (0.0027, 0.4), (0.007, 0.1)))
    grad_poly(img, near + [(W + 10, H), (-10, H)], "#6e9f3d", "#2a5118", 2170, H)
    d = ImageDraw.Draw(img)
    greens = ("#82b049", "#4d7d27", "#35611c", "#97c05c")
    for _ in range(3200):
        x = r() * W
        y = 2190 + r() * 380
        if y < near[min(len(near) - 1, int((x + 10) / 6))][1] + 12:
            continue
        ln = 8 + r() * 20 * (0.6 + (y - 2190) / 380)
        col = greens[int(r() * 4)]
        d.line(((x, y), (x + (r() - 0.5) * 7, y - ln)), fill=rgb(col), width=2)
    # овечка на гребне среднего холма
    sx = 800
    sy = mid[int((sx + 10) / 6)][1]
    ox, oy = sx - 30, sy - 40
    for lx in (38, 50, 70, 82):
        stamp_poly(img, [(ox + lx / 2 - 1.25, oy + 26), (ox + lx / 2 + 1.25, oy + 26),
                         (ox + lx / 2 + 1.25, oy + 37), (ox + lx / 2 - 1.25, oy + 37)], "#3c3a34")
    for bx, by, br in ((40, 38, 18), (58, 32, 20), (76, 36, 19), (50, 48, 18), (70, 48, 18)):
        stamp_circle(img, ox + bx / 2, oy + by / 2, br / 2, "#f6f4ec")
    stamp_circle(img, ox + 48, oy + 20, 5, "#46423c")


def _romashki(img):
    img.paste(vgrad([("#223020", 0), ("#1a2517", 0.5), ("#121b10", 1)]))
    r = rng(162)
    d = ImageDraw.Draw(img)
    grass = ("#2c3d25", "#34492a", "#1c2818", "#3d5530", "#26361f")
    for _ in range(9000):
        x = r() * W
        y = r() * H
        ln = 14 + r() * 40
        ang = -math.pi / 2 + (r() - 0.5) * 1.2
        col = grass[int(r() * 5)]
        d.line(((x, y), (x + math.cos(ang) * ln, y + math.sin(ang) * ln)), fill=rgb(col), width=3)
    blob(img, W / 2, 1380, 820, "#0b1109", stops=[(0, 190), (0.6, 130), (1, 0)], sy=1.45)

    def zone(y):
        if y < 560 or y > 2140:
            return 1.0
        if y < 700 or y > 2020:
            return 0.35
        return 0.0

    for _ in range(60):
        y = r() * H
        if (420 < y < 2260) or r() > zone(y):
            continue
        blob(img, r() * W, y, 24 + r() * 34, "#f2efe6", stops=[(0, 46), (0.6, 34), (1, 0)])
    flowers = []
    for _ in range(900):
        y = r() * H
        if r() > zone(y):
            continue
        flowers.append((r() * W, y, int(18 + r() ** 1.6 * 34), r(), r()))
    for x, y, size, t, a in flowers:
        tint = "#f6f3ea" if t < 0.66 else "#f0d3cc" if t < 0.84 else "#f3e2c8"
        al = (150 + a * 105) / 255
        stamp_poly(img, daisy_pts(x, y, size, rot=math.radians(int(t * 997) % 360)), tint, al, ss=3)
        stamp_circle(img, x, y, size * 0.15, "#dcae2c", al, ss=3)


def _fir_row(d, y_base, hmin, hmax, count, r, cols):
    for _ in range(count):
        x = r() * W
        hh = hmin + r() * (hmax - hmin)
        w = hh * 0.34
        pts = [(x, y_base - hh)]
        for k in range(1, 6):
            yy = y_base - hh + hh * k / 5
            ww = w * (0.35 + 0.65 * k / 5)
            pts.append((x + ww, yy))
            if k < 5:
                pts.append((x + ww * 0.45, yy - hh * 0.03))
        left = [(2 * x - px, py) for px, py in reversed(pts[1:])]
        d.polygon(pts + left, fill=rgb(cols[int(r() * len(cols))]))


def _taiga(img):
    img.paste(vgrad([("#cdbfa8", 0), ("#b4a488", 0.06), ("#948468", 0.12)]))
    blob(img, 980, 60, 520, "#f6dcaa", 110)
    r = rng(163)
    far = ridge(245, 30, 3, ((0.0013, 1.0), (0.004, 0.4), (0.01, 0.1)))
    grad_poly(img, far + [(W + 10, H), (-10, H)], "#958b77", "#7b705b", 200, 420)
    lit = ridge(360, 36, 9, ((0.0017, 1.0), (0.0052, 0.3), (0.012, 0.1)))
    grad_poly(img, lit + [(W + 10, H), (-10, H)], "#6f6146", "#35301f", 320, 800)
    d = ImageDraw.Draw(img)
    trees = []
    for _ in range(3400):
        y = 345 + r() * 450
        trees.append((r() * W, y, r(), r()))
    for x, y, t1, t2 in sorted(trees, key=lambda t: t[1]):
        k = (y - 345) / 450
        hh = 7 + k * 20 + t1 * 7
        w2 = hh * (0.3 + t2 * 0.1)
        d.polygon([(x, y - hh), (x - w2, y), (x, y)], fill=mix("#d9bb7d", "#8a7652", k * 0.7 + t2 * 0.3))
        d.polygon([(x, y - hh), (x, y), (x + w2, y)], fill=mix("#6a5a3c", "#2e2a1c", k * 0.7 + t2 * 0.3))
    for cx, cy, rr in ((210, 520, 260), (760, 610, 300), (1080, 450, 200), (470, 700, 220)):
        blob(img, cx, cy, rr, "#2c2718", 120, sx=1.7, sy=0.45)
    blob(img, 900, 380, 420, "#f0d59c", 55, sx=1.6, sy=0.35)
    shade = [(-10, 690), (W * 0.35, 752), (W * 0.7, 728), (W + 10, 782), (W + 10, H), (-10, H)]
    grad_poly(img, shade, "#223022", "#0e140e", 680, H)
    blob(img, W / 2, 790, 820, "#0f150f", 140, sy=0.25)
    needles = ("#1c261c", "#243024", "#172017", "#2a372a")
    for _ in range(3800):
        x = r() * W
        y = 760 + r() * (H - 760)
        hh = 10 + r() * 18
        col = needles[int(r() * 4)]
        d.polygon([(x, y - hh), (x - hh * 0.3, y), (x + hh * 0.3, y)], fill=rgb(col))
    blob(img, 250, 1500, 520, "#2a3a2a", 50)
    _fir_row(d, H + 40, 260, 420, 16, r, ("#0a0f0b", "#0d130d"))
    _fir_row(d, H + 60, 360, 560, 7, r, ("#060907",))


def _tush(img):
    img.paste((11, 11, 10), (0, 0, W, H))
    r = rng(164)
    blob(img, W * 0.12, H * 0.66, 760, "#2c2b27", 150, sy=1.2)
    blob(img, W * 0.95, H * 0.18, 560, "#1c1b19", 120)
    big = 1500
    enso(img, (W / 2 - big / 2, H * 0.555 - big / 2, W / 2 + big / 2, H * 0.555 + big / 2), "#2e2c28",
         width_k=0.085, seed=41, start=-math.pi / 2 + 0.66, span=math.tau - 1.3, s=2)
    px = img.load()
    for _ in range(30000):
        x, y = r() * W, r() * H
        v = int(22 + r() * 30)
        px[int(x), int(y)] = (v, v, v - 2)


def _manga(img):
    img.paste(vgrad([("#1f1f1f", 0), ("#404040", 0.3), ("#707070", 0.68), ("#9a9a9a", 0.83)]))
    r = rng(165)
    d = ImageDraw.Draw(img)
    for _ in range(16):
        blob(img, r() * W, 1250 + r() * 700, 120 + r() * 200, "#f2f2f2", 70 + r() * 60, sx=4.6, sy=0.16)
    for _ in range(9):
        blob(img, r() * W, 330 + r() * 700, 140 + r() * 180, "#141414", 60 + r() * 40, sx=4.2, sy=0.2)
    d.line(((120, 690), (1060, 540)), fill=(245, 245, 245), width=3)
    d.line(((520, 640), (1110, 560)), fill=(245, 245, 245), width=2)
    for yy in range(0, 820, 22):
        for xx in range(0, W + 22, 22):
            ox = 11 if (yy // 22) % 2 else 0
            rr = 5.0 * (1 - yy / 820) ** 1.4
            if rr < 0.7:
                continue
            d.ellipse((xx + ox - rr, yy - rr, xx + ox + rr, yy + rr), fill=(14, 14, 14))
    hy = 2140
    peaks = [(-10, hy - 20), (90, hy - 110), (160, hy - 80), (250, hy - 185), (330, hy - 120), (420, hy - 150),
             (520, hy - 95), (640, hy - 130), (760, hy - 75), (900, hy - 105), (1010, hy - 60),
             (1100, hy - 90), (W + 10, hy - 50)]
    grad_poly(img, peaks + [(W + 10, hy + 20), (-10, hy + 20)], "#707070", "#8e8e8e", hy - 190, hy + 20)
    for (x1, y1), (x2, y2) in zip(peaks, peaks[1:]):
        if y1 < y2:
            d.line(((x1, y1), (x1 + (x2 - x1) * 0.4, y1 + (y2 - y1) * 0.4)), fill=(236, 236, 236), width=4)
    for tx, th, tw in ((630, 120, 110), (700, 150, 130), (790, 135, 120), (870, 165, 150), (950, 125, 110),
                       (1020, 100, 90), (130, 75, 64), (190, 90, 76), (260, 70, 58)):
        d.line(((tx, hy + 8), (tx, hy + 8 - th * 0.45)), fill=(26, 26, 26), width=max(3, int(tw * 0.08)))
        for _ in range(int(22 + tw / 5)):
            ang = r() * 3.1416
            dist = r() ** 0.6
            cx = tx + math.cos(ang) * tw * 0.5 * dist
            cy = hy + 8 - th * 0.5 - math.sin(ang) * th * 0.42 * dist
            rr = tw * (0.07 + r() * 0.09)
            v = 20 + int(r() * 18)
            d.ellipse((cx - rr, cy - rr, cx + rr, cy + rr), fill=(v, v, v))
    grad_poly(img, [(-10, hy + 12), (W + 10, hy + 6), (W + 10, H), (-10, H)], "#7a7a7a", "#141414", hy, H)
    for _ in range(6000):
        x = r() * W
        y = hy + 14 + (r() ** 0.8) * (H - hy - 14)
        depth = (y - hy) / (H - hy)
        ln = 8 + depth * 80 * (0.5 + r())
        bend = (r() - 0.5) * ln * 0.5
        v = int(20 + r() * 40) if r() < 0.6 else int(150 + r() * 90)
        d.line(((x, y), (x + bend, y - ln)), fill=(v, v, v), width=max(1, int(1 + depth * 3)))


RAY_STEPS = ((0.35, 1.0), (0.6, 0.8), (0.85, 0.6), (1.1, 0.45), (1.45, 0.3))
RAY_FADE = [("#000000", 0), ("#000000", 0.19), ("#ffffff", 0.3), ("#b0b0b0", 0.6), ("#000000", 0.8)]
TUMAN_CLUSTERS = ((-20, 90, 560), (330, -10, 420), (860, 40, 480), (1180, 280, 520), (-80, 640, 400),
                  (1200, 860, 330), (140, 400, 260), (1010, 520, 240), (620, -150, 330))


def _tuman(img):
    img.paste(vgrad([("#0c140e", 0), ("#121b16", 0.28), ("#222a2c", 0.52), ("#394145", 0.72),
                     ("#7e8689", 0.8), ("#4b5356", 0.88), ("#1f2527", 1)]))
    r = rng(166)
    sun = (W * 0.56, 520)
    rays = Image.new("L", (W, H), 0)
    for k in range(11):
        a = math.pi / 2 + (k - 5) * 0.14 + (r() - 0.5) * 0.07
        half = 0.022 + r() * 0.03
        base_a = 10 + r() * 12
        for f, fa in RAY_STEPS:
            hw = half * f
            p1 = (sun[0] + math.cos(a - hw) * 2400, sun[1] + math.sin(a - hw) * 2400)
            p2 = (sun[0] + math.cos(a + hw) * 2400, sun[1] + math.sin(a + hw) * 2400)
            m = Image.new("L", (W, H), 0)
            ImageDraw.Draw(m).polygon([sun, p1, p2], fill=int(base_a * fa))
            # прозрачность копится, как у canvas: a + b·(1 − a)
            rays = ImageChops.add(rays, ImageChops.multiply(m, ImageChops.invert(rays)))
    rays = ImageChops.multiply(rays, vgrad(RAY_FADE).convert("L"))
    img.paste(Image.new("RGB", (W, H), (226, 236, 232)), (0, 0), rays)
    for _ in range(110):
        blob(img, r() * W, 1990 + r() * 220, 170 + r() * 190, "#bcc4c6", 60 + r() * 60, sx=2.4, sy=0.42)
    blob(img, W / 2, 2080, 900, "#aeb6b8", 90, sx=1.4, sy=0.3)
    blob(img, sun[0], 2420, 150, "#f2f5f5", 140, sx=0.8, sy=1.5)
    d = ImageDraw.Draw(img)
    for _ in range(300):
        y = 2250 + (r() ** 0.9) * 306
        spread = 80 + (y - 2250) * 0.9
        x = sun[0] + (r() - 0.5) * 2 * spread * (0.4 + r())
        w = 8 + r() * 46 * max(0, 1 - abs(x - sun[0]) / (spread * 1.6 + 1))
        if w < 6:
            continue
        r()  # в макете тут бралась прозрачность блика — число берём, чтобы не сбить ряд
        d.ellipse((x - w, y - 2.5, x + w, y + 2.5), fill=(226, 232, 234))
    for cx, cy, cr in TUMAN_CLUSTERS:
        blob(img, cx, cy, cr * 0.95, "#08100a", stops=[(0, 245), (0.65, 225), (1, 0)])
    ld = ImageDraw.Draw(img, "RGBA")
    lits = ("#86a852", "#a6c46a", "#c4da8c")
    darks = ("#0b150c", "#112013", "#172a17", "#1f3520")
    for cx, cy, cr in TUMAN_CLUSTERS:
        for _ in range(int(cr * 1.6)):
            ang = r() * TAU
            dist = cr * (r() ** 0.55)
            x = cx + math.cos(ang) * dist
            y = cy + math.sin(ang) * dist * 0.85
            s = 8 + r() * 16
            near = math.hypot(x - sun[0], y - sun[1]) < 470
            lit = near and dist > cr * 0.55 and r() < 0.5
            if lit:
                col, al = lits[int(r() * 3)], 200
            else:
                col, al = darks[int(r() * 4)], 240
            rot = r() * 3.1416
            pts = []
            for j in range(10):
                t = j / 10 * TAU
                px_, py_ = math.cos(t) * s, math.sin(t) * s * 0.5
                pts.append((x + px_ * math.cos(rot) - py_ * math.sin(rot),
                            y + px_ * math.sin(rot) + py_ * math.cos(rot)))
            ld.polygon(pts, fill=rgb(col) + (al,))
    blob(img, sun[0], sun[1], 300, "#f6f9ee", stops=[(0, 150), (0.4, 60), (1, 0)])
    blob(img, sun[0], sun[1], 60, "#ffffff", stops=[(0, 255), (0.45, 210), (1, 0)])
    for k in range(8):
        a = k * math.pi / 4 + 0.35
        L = 110 if k % 2 else 170
        d.line((sun, (sun[0] + math.cos(a) * L, sun[1] + math.sin(a) * L)), fill=(255, 255, 255), width=3)


_PAINTERS = {"pole": _pole, "romashki": _romashki, "taiga": _taiga,
             "tush": _tush, "manga": _manga, "tuman": _tuman}
_cache: "OrderedDict[str, Image.Image]" = OrderedDict()


def scene_image(key: str) -> Image.Image:
    """Готовый фон сцены (RGB). Он один на всех, поэтому держим пару последних в памяти."""
    if key in _cache:
        _cache.move_to_end(key)
        return _cache[key]
    img = Image.new("RGB", (W, H), rgb(SCENE_BASE[key]))
    _PAINTERS[key](img)
    _cache[key] = img
    while len(_cache) > 3:
        _cache.popitem(last=False)
    return img
