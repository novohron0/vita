"""Постоянный адрес обоев: ссылка в ярлыке одна, дизайн за ней меняется кнопкой."""
import os
import re
import sys
import tempfile
from pathlib import Path

from fastapi import HTTPException
from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

with tempfile.TemporaryDirectory(prefix="vita-wall-") as data_dir:
    os.environ["VITA_DATA"] = data_dir
    from app import main

    class FakeRequest:
        base_url = "http://testserver/"

    # каждому заголовку — свой цвет: по байтам картинки видно, чей дизайн пришёл
    COLORS = {"Первые": "#ff0000", "Вторые": "#0000ff", "Гость": "#00ff00"}

    def fake_render(cfg, today=None, expired=False):
        return Image.new("RGB", (4, 4), COLORS.get(cfg.get("title", ""), "#000000"))

    main.render_wallpaper = fake_render
    png = lambda code: main.wallpaper(code).body

    token = "wall-owner-" + "7" * 24
    other = "wall-other-" + "8" * 24
    main.ensure_profile(main.ProfileIn(ownerToken=token))
    main.ensure_profile(main.ProfileIn(ownerToken=other))

    first = main.create_link(main.LinkIn(ownerToken=token, title="Первые"), FakeRequest())
    wall = re.fullmatch(r"http://testserver/w/([a-z0-9]{8})\.png", first["wall"]).group(1)

    me = main.ensure_profile(main.ProfileIn(ownerToken=token))
    assert me["wallCode"] == wall, "постоянный адрес виден в профиле"
    assert me["activeLink"] == first["code"], "первые обои сразу активны"

    # постоянный адрес отдаёт активный дизайн и считает скачивание ему
    assert png(wall) == png(first["code"]), "за постоянным адресом — первые обои"
    with main.db() as conn:
        assert conn.execute(
            "SELECT fetches FROM links WHERE code = ?", (first["code"],)
        ).fetchone()[0] == 2, "скачивание считаем самому дизайну"

    second = main.create_link(main.LinkIn(ownerToken=token, title="Вторые"), FakeRequest())
    assert second["wall"] == first["wall"], "адрес у профиля один на все обои"
    assert png(wall) == png(first["code"]), "новый дизайн сам обои не подменяет"
    assert png(second["code"]) != png(first["code"]), "дизайны разные"

    main.activate_link(second["code"], main.OwnerIn(ownerToken=token, tz="Asia/Yekaterinburg"))
    assert png(wall) == png(second["code"]), "после «Поставить» приходит новый дизайн"
    with main.db() as conn:
        assert conn.execute(
            "SELECT tz FROM links WHERE code = ?", (second["code"],)
        ).fetchone()[0] == "Asia/Yekaterinburg", "пояс телефона пишем и при выборе"

    # старые адреса дизайнов живы: у кого ярлык настроен на них, ничего не ломается
    assert png(first["code"]) != png(second["code"]), "старый адрес отдаёт свой дизайн"

    # чужие обои не выбрать и чужого адреса не занять
    try:
        main.activate_link(second["code"], main.OwnerIn(ownerToken=other))
        raise AssertionError("чужие обои выбирать нельзя")
    except HTTPException as exc:
        assert exc.status_code == 403, exc.status_code
    try:
        main.activate_link("zzzzzz", main.OwnerIn(ownerToken=token))
        raise AssertionError("несуществующие обои")
    except HTTPException as exc:
        assert exc.status_code == 404, exc.status_code

    # удалили активные — адрес не умирает, показывает самые свежие из оставшихся
    main.drop_link(second["code"], ownerToken=token)
    assert png(wall) == png(first["code"]), "адрес не умирает вместе с дизайном"

    # обои без профиля постоянного адреса не получают
    guest = main.create_link(main.LinkIn(ownerToken="", title="Гость"), FakeRequest())
    assert guest["wall"] == "", guest
    assert png(guest["code"]) != png(first["code"]), "гостевые обои рисуются своим"

    # чужой адрес наугад — 404
    try:
        main.wallpaper("zzzzzzzz")
        raise AssertionError("нет такого адреса")
    except HTTPException as exc:
        assert exc.status_code == 404, exc.status_code

    print("ok: постоянный адрес отдаёт выбранный дизайн, старые ссылки живы")
