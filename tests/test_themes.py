"""Темы обоев: шесть сцен, новые формы точек, свечение и цвета текста.

Проверяем, что каждая тема и каждая новая форма рисуются во всех режимах,
что генератор случайности тот же, что в static/scenes.js (иначе превью
разойдётся с обоями), и что ссылка на обои хранит новые поля, а мусор в
цветах текста отбрасывает.
"""
import json
import os
import sys
import tempfile
from datetime import date
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

THEMES = {
    "pole": dict(bg="pole", color="#5b7f35", shape="circle", font="oswald",
                 textColor="#46642a", textMuted="#557040"),
    "romashki": dict(bg="romashki", color="#f5f2ea", shape="daisy", font="unbounded",
                     textColor="#eeebe3", textMuted="#9ba7b3"),
    "taiga": dict(bg="taiga", color="#cf9f5c", shape="fir", font="ptnarrow",
                  textColor="#cbc3b5", textMuted="#8f887c"),
    "tush": dict(bg="tush", color="#e9e4d8", shape="ink", font="playfair",
                 textColor="#ebe6da", textMuted="#8f8a80"),
    "manga": dict(bg="manga", color="#f7f7f7", shape="tone", font="russo",
                  textColor="#f7f7f7", textMuted="#e2e2e2", textStroke="#111111"),
    "tuman": dict(bg="tuman", color="#dfe7ea", shape="circle", font="ptserif", glass=True, glow=True,
                  textColor="#e4eaec", textMuted="#aab4b8"),
}

with tempfile.TemporaryDirectory(prefix="vita-themes-") as data_dir:
    os.environ["VITA_DATA"] = data_dir
    from app import main, render, scenes

    # 1. Генератор — тот же mulberry32, что в scenes.js: числа сверены с node
    r = scenes.rng(161)
    assert [round(r(), 10) for _ in range(3)] == [0.2903478476, 0.2421757863, 0.7667436316]

    # 2. Каждая тема рисуется в любом режиме, а её фон заметно отличается от чёрного
    day = date(2026, 9, 19)
    for key, look in THEMES.items():
        for mode in ("month", "year", "life", "goal"):
            img = render.render_wallpaper(dict(mode=mode, title="ТВОЙ МЕСЯЦ", **look), day)
            assert img.size == (render.W, render.H), (key, mode)
        corner = img.resize((8, 16)).getpixel((0, 0))
        assert key == "tush" or sum(corner) > 30, (key, corner)
        assert key in scenes.SCENES and key in render.BGS

    # 3. Новые формы — в списке и рисуются на любом фоне, стеклом и без
    for shape in scenes.NEW_SHAPES:
        assert shape in render.SHAPES
        for bg in ("black", "white", "sunset", "tuman"):
            for glass in (False, True):
                render.render_wallpaper(dict(mode="month", bg=bg, color="#ff9500", shape=shape,
                                             glass=glass, glow=glass), day)
        # форма лежит в коробке точки (с небольшим запасом у ромашки и ёлки)
        pts = scenes.shape_pts(shape, 0, 0, 100, 5)
        if pts is not None:
            assert min(p[0] for p in pts) > -12 and max(p[0] for p in pts) < 112, shape
            assert min(p[1] for p in pts) > -12 and max(p[1] for p in pts) < 112, shape

    # 4. Свечение и цвет текста правда меняют картинку
    base = dict(mode="month", bg="black", color="#ffb37c", shape="circle", title="ТЕСТ")
    plain = render.render_wallpaper(base, day)
    glowing = render.render_wallpaper(dict(base, glow=True), day)
    assert plain.tobytes() != glowing.tobytes()
    tinted = render.render_wallpaper(dict(base, textColor="#00ff00"), day)
    assert plain.tobytes() != tinted.tobytes()
    # мусор вместо цвета — как будто цвета нет
    junk = render.render_wallpaper(dict(base, textColor="red; drop", textMuted="#12"), day)
    assert plain.tobytes() == junk.tobytes()

    # 5. Ссылка хранит новые поля, а плохие цвета текста чистит
    class Req:
        base_url = "http://test/"

    link = main.create_link(main.LinkIn(**THEMES["manga"], mode="month", title="ТВОЙ МЕСЯЦ"), Req())
    bad = main.create_link(main.LinkIn(bg="tuman", glow=True, textColor="url(x)", textStroke="#abc"), Req())
    with main.db() as conn:
        cfg = json.loads(conn.execute("SELECT config FROM links WHERE code = ?", (link["code"],)).fetchone()[0])
        cfg_bad = json.loads(conn.execute("SELECT config FROM links WHERE code = ?", (bad["code"],)).fetchone()[0])
    assert cfg["textStroke"] == "#111111" and cfg["shape"] == "tone" and cfg["bg"] == "manga"
    assert cfg_bad["glow"] is True and cfg_bad["textColor"] == "" and cfg_bad["textStroke"] == ""

    # 6. Сцена рисуется один раз и берётся из памяти
    a = scenes.scene_image("pole")
    assert scenes.scene_image("pole") is a

print("test_themes: ok")
