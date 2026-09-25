"""Страница установки показывает обои, но скачиванием это не считается.

Картинки на /s/<код> (блокировка и «Домой» в анимации разблокировки) идут с
view=1: иначе каждый просмотр страницы накручивал fetches и last_fetch, и по
ним уже не понять, ходил ли за обоями ярлык.
"""
import os
import sys
import tempfile
from pathlib import Path

from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

with tempfile.TemporaryDirectory(prefix="vita-view-") as data_dir:
    os.environ["VITA_DATA"] = data_dir
    from app import main

    class FakeRequest:
        base_url = "http://testserver/"

    def fake_render(cfg, today=None, expired=False):
        return Image.new("RGB", (4, 4), "#204060")

    main.render_wallpaper = fake_render
    main.render_home = fake_render

    token = "view-owner-" + "5" * 24
    main.ensure_profile(main.ProfileIn(ownerToken=token))
    link = main.create_link(main.LinkIn(ownerToken=token, title="Смотрю"), FakeRequest())
    code = link["code"]
    wall = link["wall"].rsplit("/", 1)[1].removesuffix(".png")

    def counters():
        with main.db() as conn:
            return conn.execute(
                "SELECT fetches, last_fetch FROM links WHERE code = ?", (code,)
            ).fetchone()

    html = main.setup_page(code, FakeRequest()).body.decode()
    assert f'src="http://testserver/w/{code}.png?view=1"' in html, "блокировка — без счёта"
    assert f'src="http://testserver/w/{code}.png?home=1&view=1"' in html, "«Домой» — без счёта"
    assert f">http://testserver/w/{wall}.png</code>" in html, "в ярлык — чистый постоянный адрес"
    assert "{{" not in html, "все подстановки на месте"

    # страница показывает обе картинки — счётчик ярлыка стоит
    lock = main.wallpaper(code, view=1).body
    home = main.wallpaper(code, home=1, view=1).body
    assert lock and home
    assert counters() == (0, None), counters()
    assert 'id="reviewBlock"' not in main.setup_page(code, FakeRequest()).body.decode(), \
        "просмотр страницы — ещё не пользовался"

    # ярлык качает — считаем, и по постоянному адресу тоже
    assert main.wallpaper(code).body == lock, "та же картинка, что на странице"
    fetches, last_fetch = counters()
    assert fetches == 1 and last_fetch, (fetches, last_fetch)
    main.wallpaper(wall, home=1)
    assert counters()[0] == 2, counters()
    assert 'id="reviewBlock"' in main.setup_page(code, FakeRequest()).body.decode(), \
        "ярлык реально тянул обои — можно просить отзыв"

    print("ok: картинки на странице установки не накручивают скачивания")
