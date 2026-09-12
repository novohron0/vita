"""Вход через телеграм: подпись, привязка профиля и возврат в свой аккаунт."""
import asyncio
import hashlib
import hmac
import json
import os
import sys
import tempfile
from pathlib import Path

from fastapi import HTTPException
from starlette.requests import Request

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

BOT_TOKEN = "8000000:TESTTOKENTESTTOKENTESTTOKEN"


def signed(fields: dict) -> dict:
    """Собирает данные так же, как виджет телеграма: с настоящей подписью."""
    check = "\n".join(f"{k}={fields[k]}" for k in sorted(fields))
    secret = hashlib.sha256(BOT_TOKEN.encode()).digest()
    data = dict(fields)
    data["hash"] = hmac.new(secret, check.encode(), hashlib.sha256).hexdigest()
    return data


def call(payload: dict):
    """Вызов ручки входа с телом запроса, как это делает браузер."""
    body = json.dumps(payload).encode()

    async def receive():
        return {"type": "http.request", "body": body, "more_body": False}

    request = Request({
        "type": "http", "http_version": "1.1", "method": "POST",
        "scheme": "https", "path": "/api/auth/telegram", "raw_path": b"/api/auth/telegram",
        "query_string": b"", "headers": [(b"content-type", b"application/json")],
        "server": ("vitadots.ru", 443), "client": ("1.2.3.4", 1), "root_path": "",
    }, receive)
    # ручка отдаёт JSONResponse (ставит куку), тело разбираем сами
    return json.loads(asyncio.run(main.auth_telegram(request)).body)


def wallpaper_request():
    return Request({
        "type": "http", "http_version": "1.1", "method": "GET",
        "scheme": "https", "path": "/", "raw_path": b"/", "query_string": b"",
        "headers": [(b"host", b"vitadots.ru")], "server": ("vitadots.ru", 443),
        "client": ("1.2.3.4", 1), "root_path": "",
    })


with tempfile.TemporaryDirectory(prefix="vita-tg-") as data_dir:
    os.environ["VITA_DATA"] = data_dir
    os.environ["TG_BOT_TOKEN"] = BOT_TOKEN
    os.environ["TG_BOT_NAME"] = "vita_login_bot"

    from app import main

    now = int(__import__("time").time())
    phone_token = "phone-token-" + "1" * 24

    # человек сделал обои без всякого входа
    link = main.create_link(main.LinkIn(ownerToken=phone_token), wallpaper_request())

    # 1. Чужая подпись не пускает.
    fake = {"id": 555, "auth_date": now, "first_name": "Чужак", "hash": "0" * 64}
    try:
        call({**fake, "ownerToken": phone_token})
        raise AssertionError("подделанный вход должен отбиваться")
    except HTTPException as exc:
        assert exc.status_code == 403

    # 2. Протухшее подтверждение (двое суток назад) — тоже мимо.
    stale = signed({"id": 555, "auth_date": now - 200000, "first_name": "Камиль"})
    try:
        call({**stale, "ownerToken": phone_token})
        raise AssertionError("старое подтверждение не должно пускать")
    except HTTPException as exc:
        assert exc.status_code == 403

    # 3. Настоящий вход: телеграм закрепляется за профилем этого браузера.
    good = signed({"id": 555, "auth_date": now, "first_name": "Камиль", "username": "kamil"})
    first = call({**good, "ownerToken": phone_token})
    assert first["linked"] is True
    assert first["telegram"] == "@kamil"
    profile_code = first["profile"]["code"]
    assert first["profile"]["wallpapers"][0]["code"] == link["code"], "обои не должны потеряться"

    # 4. Другой телефон, пустой браузер — возвращаемся в тот же аккаунт с обоями.
    second = call({**good, "ownerToken": "other-device-" + "2" * 24})
    assert second["linked"] is False
    assert second["profile"]["code"] == profile_code
    assert second["profile"]["wallpapers"][0]["code"] == link["code"]
    assert second["token"] != first["token"], "каждому устройству — свой ключ"

    # новый ключ действительно открывает тот же профиль
    with main.db() as conn:
        assert main._profile_for_token(conn, second["token"]) == profile_code
        assert main._telegram_handle(conn, profile_code) == "@kamil"

    # 5. Другой человек в телеграме — другой аккаунт.
    other = signed({"id": 777, "auth_date": now, "first_name": "Аня"})
    third = call({**other, "ownerToken": "friend-token-" + "3" * 24})
    assert third["profile"]["code"] != profile_code
    assert third["telegram"] == "Аня", "без ника показываем имя"

    # 6. Купленный доступ виден сразу после входа.
    with main.db() as conn:
        main._grant_forever(conn, profile_code)
    back = call({**good, "ownerToken": "fresh-browser-" + "4" * 24})
    assert back["access"]["paid"] is True
    assert back["access"]["telegram"] == "@kamil"

    # 7. Без токена бота вход выключен целиком.
    saved = main.TG_BOT_TOKEN
    main.TG_BOT_TOKEN = ""
    try:
        call({**good, "ownerToken": phone_token})
        raise AssertionError("без бота вход недоступен")
    except HTTPException as exc:
        assert exc.status_code == 503
    finally:
        main.TG_BOT_TOKEN = saved

print("Vita telegram login: passed")
