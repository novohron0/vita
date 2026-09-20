"""Расположение: размер точек, число в ряду и перетаскивание по периметру.

Проверяем, что нетронутые обои выглядят ровно как раньше, что настройки
доезжают от ссылки до картинки, что мусор из браузера не ломает рендер и
что за периметр сетку не выпускает. Числа периметра и формулы повторены в
static/app.js — расхождение тут значит, что превью разойдётся с обоями.
"""
import json
import os
import sys
import tempfile
from datetime import date
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

with tempfile.TemporaryDirectory(prefix="vita-place-") as data_dir:
    os.environ["VITA_DATA"] = data_dir
    from app import main, render

    day = date(2026, 9, 20)
    W, H = render.W, render.H
    bx0, by0, bx1, by1 = render.PLACE_BOX

    # 1. Пустое расположение = старая раскладка: сетка по центру, подписи на
    # прежних отступах. Если это разойдётся, у всех разом переедут обои.
    empty = render.place_cfg({})
    g = render._place_geom(empty, "month", 30)
    assert g["cols"] == 6 and abs(g["dot"] - 848.88 / 8.25) < 0.01
    assert abs(g["x0"] - (W - g["grid_w"]) / 2) < 1e-9
    assert abs(g["y0"] - (H * 0.55 - g["grid_h"] / 2)) < 1e-9
    assert abs(g["title"]["y"] - (g["y0"] - 190)) < 1e-9
    assert abs(g["vita"]["y"] - (g["y0"] - 110)) < 1e-9
    assert abs(g["foot"]["y"] - (g["y0"] + g["grid_h"] + 130)) < 1e-9
    assert (g["title"]["px"], g["vita"]["px"], g["foot"]["px"]) == (64, 32, 40)

    # 2. Мусор от браузера не проходит: остаются значения по умолчанию
    junk = render.place_cfg({"dots": {"x": "слева", "y": None, "s": "много", "cols": 999},
                             "title": "нет", "bad": 1})
    assert junk == render.place_cfg(None) == render.place_cfg([])
    assert junk["dots"]["cols"] == 0 and junk["dots"]["s"] == 1.0

    # 3. Размер и число в ряду правда меняют сетку, и ползунок ограничен
    small = render.place_cfg({"dots": {"x": None, "y": None, "s": 0.6, "cols": 15}})
    gs = render._place_geom(small, "month", 30)
    assert gs["cols"] == 15 and gs["dot"] < g["dot"] / 2
    huge = render.place_cfg({"dots": {"s": 9, "cols": 15}})
    assert huge["dots"]["s"] == 1.3          # выше 130 % ползунок не пускают
    gh = render._place_geom(huge, "month", 30)
    assert gh["grid_w"] <= bx1 - bx0 + 1e-9  # и сетка всё равно влезает в периметр

    # 4. Мельче точки — ближе подписи, но не вплотную
    assert gs["vita"]["y"] > gs["y0"] - 110 and gs["vita"]["y"] <= gs["y0"] - 64

    # 5. Утащили сетку за край — держим внутри периметра
    far = render.place_cfg({"dots": {"x": -3, "y": 5, "s": 1, "cols": 6}})
    gf = render._place_geom(far, "month", 30)
    assert gf["x0"] >= bx0 - 1e-9 and gf["x0"] + gf["grid_w"] <= bx1 + 1e-9
    assert gf["y0"] >= by0 - 1e-9 and gf["y0"] + gf["grid_h"] <= by1 + 1e-9

    # 6. Обои рисуются во всех режимах и правда отличаются от нетронутых
    moved = {"dots": {"x": 0.36, "y": 0.72, "s": 0.7, "cols": 10},
             "title": {"x": 0.5, "y": 0.12, "s": 0.8},
             "vita": {"x": None, "y": None, "s": 1.2},
             "foot": {"x": 0.5, "y": 0.9, "s": 1.1}}
    base = dict(mode="month", bg="black", color="#f2f2f2", shape="circle", title="ТВОЙ МЕСЯЦ")
    plain = render.render_wallpaper(base, day)
    shifted = render.render_wallpaper(dict(base, place=moved), day)
    assert plain.tobytes() != shifted.tobytes()
    assert render.render_wallpaper(dict(base, place={}), day).tobytes() == plain.tobytes()
    for mode in ("year", "life", "goal"):
        img = render.render_wallpaper(dict(base, mode=mode, place=moved,
                                           birth="1995-04-10", start="2026-09-01", end="2026-10-11"), day)
        assert img.size == (W, H), mode

    # 7. Ссылка хранит разобранное расположение, а не то, что прислал браузер
    class Req:
        base_url = "http://test/"

    link = main.create_link(main.LinkIn(mode="month", title="ТВОЙ МЕСЯЦ",
                                        place=dict(moved, лишнее=1)), Req())
    with main.db() as conn:
        cfg = json.loads(conn.execute(
            "SELECT config FROM links WHERE code = ?", (link["code"],)).fetchone()[0])
    assert set(cfg["place"]) == {"dots", "title", "vita", "foot"}
    assert cfg["place"]["dots"]["cols"] == 10 and cfg["place"]["dots"]["s"] == 0.7
    assert cfg["place"]["vita"]["x"] is None

print("test_place: ok")
