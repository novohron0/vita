"""Экран «Домой»: размытие с силой, ровный цвет или своё фото — вторым адресом."""
import os
import sys
import tempfile
from pathlib import Path

from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

with tempfile.TemporaryDirectory(prefix="vita-home-") as data_dir:
    os.environ["VITA_DATA"] = data_dir
    from app import main, render

    class FakeRequest:
        base_url = "http://testserver/"

    # --- разбор настроек: мусор не пролезает, значения зажаты ---
    assert render.home_cfg(None) == {"mode": "blur", "blur": 30, "color": "#101014", "photo": ""}
    assert render.home_cfg({"mode": "нет такого"})["mode"] == "blur"
    assert render.home_cfg({"blur": 900})["blur"] == 100
    assert render.home_cfg({"blur": -5})["blur"] == 0
    assert render.home_cfg({"blur": "тридцать"})["blur"] == 30
    assert render.home_cfg({"color": "красный"})["color"] == "#101014"
    assert render.home_cfg({"color": "#A1B2C3"})["color"] == "#A1B2C3"
    assert render.home_cfg({"photo": "../../etc"})["photo"] == ""
    assert render.home_cfg({"photo": "ab12cd"})["photo"] == "ab12cd"

    drawn = []

    def fake_wall(cfg, today=None, expired=False):
        drawn.append(cfg.get("title", ""))
        img = Image.new("RGB", (render.W, render.H), "#204060")
        img.putpixel((0, 0), (255, 255, 255))   # светлая точка: по ней видно размытие
        return img

    render.render_wallpaper = fake_wall

    # --- ровный цвет: обои даже не рисуются ---
    before = len(drawn)
    flat = render.render_home({"home": {"mode": "color", "color": "#1a2b3c"}})
    assert flat.size == (render.W, render.H)
    assert flat.getpixel((10, 10)) == (26, 43, 60), flat.getpixel((10, 10))
    assert len(drawn) == before, "для ровного цвета точки рисовать незачем"

    # --- размытие: светлая точка расплывается, картинка темнеет ---
    sharp = render.render_home({"home": {"mode": "blur", "blur": 0}})
    assert sharp.getpixel((0, 0)) == (255, 255, 255), "0 % — как на блокировке"
    soft = render.render_home({"home": {"mode": "blur", "blur": 40}})
    assert soft.getpixel((0, 0))[0] < 120, "точка размазалась"
    assert soft.getpixel((600, 1200))[2] < 96, "и картинка чуть темнее"

    # --- своё фото ---
    photo_dir = Path(data_dir) / "bg"
    photo_dir.mkdir(parents=True, exist_ok=True)
    Image.new("RGB", (1179, 2556), "#7d0f0f").save(photo_dir / "ph1234.jpg")
    own = render.render_home({"home": {"mode": "photo", "photo": "ph1234"}})
    assert own.getpixel((100, 100))[0] > 100 and own.getpixel((100, 100))[1] < 40, own.getpixel((100, 100))
    # фото потерялось — вместо пустоты размытые обои
    lost = render.render_home({"home": {"mode": "photo", "photo": "net123"}})
    assert lost.getpixel((600, 1200))[2] > 40, "запасной путь — размытие"

    # --- ручка: /w/<код>.png?home=1 отдаёт другую картинку, кэш их не путает ---
    main.render_home = render.render_home
    main.render_wallpaper = fake_wall
    token = "home-owner-" + "4" * 24
    main.ensure_profile(main.ProfileIn(ownerToken=token))
    link = main.create_link(
        main.LinkIn(ownerToken=token, title="Домой",
                    home={"mode": "color", "color": "#1a2b3c", "blur": 70}),
        FakeRequest(),
    )
    lock = main.wallpaper(link["code"]).body
    home = main.wallpaper(link["code"], home=1).body
    assert lock != home, "экран блокировки и «Домой» — разные картинки"
    assert main.wallpaper(link["code"], home=1).body == home, "второй раз берём из кэша"

    # настройки «Домой» доходят до базы разобранными
    cfg = main.link_config(link["code"])["config"]
    assert cfg["home"] == {"mode": "color", "blur": 70, "color": "#1a2b3c", "photo": ""}, cfg["home"]

    # и постоянный адрес умеет то же самое
    wall = link["wall"].rsplit("/", 1)[1].removesuffix(".png")
    assert main.wallpaper(wall, home=1).body == home

    print("ok: экран «Домой» рисуется цветом, фото и размытием")
