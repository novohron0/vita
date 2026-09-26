"""Сцены-фоны для превью на сайте — готовыми картинками с того же рисунка, что у сервера.

Превью раньше рисовало сцены само (static/scenes.js) — 30–165 мс на каждый тап по
фону, и в памяти держались только две. Теперь браузер берёт готовую картинку:
она приходит сразу и совпадает с тем, что потом ляжет на обои.

Запуск после любой правки рисунка сцен в app/scenes.py:
    VITA_DATA=/tmp/vita-chk python3 scripts/scene-images.py
и поднять ?v= у SCENE_IMG_V в static/app.js. Тест: tests/test_scene_images.py.
"""
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from app import scenes  # noqa: E402

OUT = ROOT / "static" / "img" / "scenes"
QUALITY = 80   # на телефоне в превью разницы с 88 не видно, а весит в полтора раза меньше


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    for key in scenes.SCENES:
        path = OUT / f"{key}.webp"
        scenes.scene_image(key).convert("RGB").save(path, "WEBP", quality=QUALITY, method=6)
        print(f"{path.relative_to(ROOT)}: {path.stat().st_size // 1024} КБ")


if __name__ == "__main__":
    main()
