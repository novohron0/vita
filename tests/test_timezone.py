"""Часовой пояс: обои считают «сегодня» по часам человека, а не по Москве.

Ярлык качает картинку в 00:05 по времени телефона. В Екатеринбурге это
22:05 по Москве — по московской дате обои всегда отставали бы на день.
"""
import os
import sys
import tempfile
from datetime import date, datetime, timezone
from pathlib import Path

from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

with tempfile.TemporaryDirectory(prefix="vita-tz-") as data_dir:
    os.environ["VITA_DATA"] = data_dir
    from app import main

    class FakeRequest:
        base_url = "http://testserver/"

    # пояс из браузера: берём только настоящие
    assert main._clean_tz("Asia/Yekaterinburg") == "Asia/Yekaterinburg"
    assert main._clean_tz("America/Argentina/Buenos_Aires") == "America/Argentina/Buenos_Aires"
    assert main._clean_tz("UTC") == "UTC"
    for bad in ("", "Mars/Base", "../etc/passwd", "Europe/../../x", "A" * 100, "Europe/Moscow;"):
        assert main._clean_tz(bad) == "", bad

    # 21.09, 19:05 по Гринвичу: в Москве 22:05, в Екатеринбурге уже 00:05 22.09
    now = datetime(2026, 9, 21, 19, 5, tzinfo=timezone.utc)
    main._utcnow = lambda: now
    assert main._local_today("Asia/Yekaterinburg") == date(2026, 9, 22)
    assert main._local_today("Europe/Moscow") == date(2026, 9, 21)
    assert main._local_today("") == date.today(), "без пояса — как раньше, по часам сервера"
    assert main._local_today("Mars/Base") == date.today()

    seen = []

    def fake_render(cfg, today=None, expired=False):
        seen.append((today, expired))
        return Image.new("RGB", (4, 4), "black")

    main.render_wallpaper = fake_render

    token = "tz-owner-" + "5" * 24
    main.ensure_profile(main.ProfileIn(ownerToken=token))
    east = main.create_link(main.LinkIn(ownerToken=token, tz="Asia/Yekaterinburg"), FakeRequest())["code"]
    plain = main.create_link(main.LinkIn(ownerToken="", tz="нет такого"), FakeRequest())["code"]
    with main.db() as conn:
        assert conn.execute("SELECT tz FROM links WHERE code = ?", (east,)).fetchone()[0] == "Asia/Yekaterinburg"
        assert conn.execute("SELECT tz FROM links WHERE code = ?", (plain,)).fetchone()[0] == ""
        cfg = conn.execute("SELECT config FROM links WHERE code = ?", (east,)).fetchone()[0]
    assert '"tz"' not in cfg, "пояс живёт в колонке, а не в настройках вида"

    main.wallpaper(east)
    assert seen[-1] == (date(2026, 9, 22), False), seen[-1]
    main.wallpaper(plain)
    assert seen[-1] == (date.today(), False), seen[-1]

    # проба кончилась 21.09: у москвича ещё вечер 21-го, у уральца уже 22-е —
    # его точки замирают на дате окончания, дальше не бегут
    with main.db() as conn:
        conn.execute("UPDATE links SET access_until = '2026-09-21' WHERE code = ?", (east,))
    main.wallpaper(east)
    assert seen[-1] == (date(2026, 9, 21), True), seen[-1]

    # кэш: одинаковые обои в разных поясах — разные картинки
    before = len(seen)
    main._wallpaper_png('{"mode": "month"}', None, date(2026, 9, 22))
    main._wallpaper_png('{"mode": "month"}', None, date(2026, 9, 21))
    main._wallpaper_png('{"mode": "month"}', None, date(2026, 9, 22))
    assert len(seen) == before + 2, "третья картинка должна прийти из кэша"

    # старые обои без пояса получают его, когда человек заходит на сайт
    with main.db() as conn:
        conn.execute("UPDATE links SET tz = NULL WHERE code = ?", (east,))
    main.access_state(main.OwnerIn(ownerToken=token, tz="Asia/Vladivostok"))
    with main.db() as conn:
        assert conn.execute("SELECT tz FROM links WHERE code = ?", (east,)).fetchone()[0] == "Asia/Vladivostok"
    main.access_state(main.OwnerIn(ownerToken=token, tz="мусор"))
    with main.db() as conn:
        assert conn.execute("SELECT tz FROM links WHERE code = ?", (east,)).fetchone()[0] == "Asia/Vladivostok"

print("timezone ok")
