"""Картинки сцен для превью на месте и совпадают с тем, что рисует сервер.

Превью берёт сцены-фоны готовыми (static/img/scenes/*.webp, их делает
scripts/scene-images.py). Поменяли рисунок в app/scenes.py и забыли
перерисовать картинки — превью врёт; этот тест ловит расхождение.
"""
import os
import sys
import tempfile
from pathlib import Path

from PIL import Image, ImageChops, ImageStat

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

with tempfile.TemporaryDirectory(prefix="vita-scenes-") as data_dir:
    os.environ["VITA_DATA"] = data_dir
    from app import render, scenes

    app_js = (ROOT / "static" / "app.js").read_text(encoding="utf-8")
    assert "const SCENE_IMG_V = " in app_js, "превью знает версию картинок сцен"

    for key in scenes.SCENES:
        path = ROOT / "static" / "img" / "scenes" / f"{key}.webp"
        assert path.exists(), f"нет картинки сцены {key}: scripts/scene-images.py"
        img = Image.open(path).convert("RGB")
        assert img.size == (render.W, render.H), (key, img.size)
        want = scenes.scene_image(key).convert("RGB")
        diff = sum(ImageStat.Stat(ImageChops.difference(img, want)).mean) / 3
        # WebP с потерями даёт единицы; другой рисунок — десятки
        assert diff < 4, f"{key}: картинка разошлась с рисунком сервера на {diff:.1f}"
        assert path.stat().st_size < 400 * 1024, f"{key}: картинка тяжелее 400 КБ"

    print("ok: картинки сцен на месте и совпадают с сервером")
