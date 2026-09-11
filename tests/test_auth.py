"""Вход по почте и паролю: регистрация, вход, смена забытого пароля письмом.

Гоняется на временном каталоге — боевую ~/vita/data трогать нельзя.
"""
import json
import os
import re
import sys
import tempfile
from pathlib import Path

from fastapi import HTTPException

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

with tempfile.TemporaryDirectory(prefix="vita-auth-") as data_dir:
    os.environ["VITA_DATA"] = data_dir

    from app import main

    def body(response):
        """Ручки входа отдают JSONResponse — из-за куки с ключом устройства."""
        return json.loads(response.body) if hasattr(response, "body") else response

    browser = "0123456789abcdef" * 3

    # --- регистрация закрепляет за почтой тот профиль, что уже есть в браузере ---
    before = main.ensure_profile(main.ProfileIn(ownerToken=browser))
    reg = body(main.auth_register(main.AuthIn(
        email="Kot@Primer.RU", password="tochki123", ownerToken=browser)))
    assert reg["profile"]["code"] == before["code"], "регистрация увела в чужой профиль"
    assert len(reg["token"]) >= 40, "не выдан ключ устройства"

    # почта приводится к нижнему регистру, иначе один человек заведёт два аккаунта
    with main.db() as conn:
        row = conn.execute("SELECT email FROM profile_auth").fetchone()
    assert row[0] == "kot@primer.ru", row

    # --- та же почта второй раз не проходит ---
    try:
        main.auth_register(main.AuthIn(
            email="kot@primer.ru", password="tochki123", ownerToken="f" * 40))
        raise AssertionError("почту дали занять дважды")
    except HTTPException as error:
        assert error.status_code == 409, error.status_code

    # --- и к одному профилю нельзя привязать вторую почту ---
    try:
        main.auth_register(main.AuthIn(
            email="vtoraya@primer.ru", password="tochki123", ownerToken=browser))
        raise AssertionError("к профилю привязали вторую почту")
    except HTTPException as error:
        assert error.status_code == 409, error.status_code

    # --- слабый пароль и кривая почта ---
    for bad in (
        main.AuthIn(email="novy@primer.ru", password="123", ownerToken="a" * 40),
        main.AuthIn(email="ne-pochta", password="tochki123", ownerToken="a" * 40),
    ):
        try:
            main.auth_register(bad)
            raise AssertionError(f"пропустили негодные данные: {bad}")
        except HTTPException as error:
            assert error.status_code == 422, error.status_code

    # --- вход с чистого устройства возвращает в тот же аккаунт ---
    login = body(main.auth_login(main.AuthIn(email="kot@primer.ru", password="tochki123")))
    assert login["profile"]["code"] == before["code"], "вход привёл не туда"
    assert login["token"] != reg["token"], "переиспользован старый ключ устройства"

    # старый ключ продолжает работать: вход с телефона не выбивает с ноутбука
    with main.db() as conn:
        assert main._profile_for_token(conn, reg["token"]) == before["code"]
        assert main._profile_for_token(conn, login["token"]) == before["code"]

    # --- неверный пароль и несуществующая почта отвечают одинаково ---
    answers = set()
    for data in (
        main.AuthIn(email="kot@primer.ru", password="nepravilno"),
        main.AuthIn(email="nikogo@primer.ru", password="tochki123"),
    ):
        try:
            main.auth_login(data)
            raise AssertionError("пустили с неверным паролем")
        except HTTPException as error:
            answers.add((error.status_code, error.detail))
    assert len(answers) == 1, f"по ответу видно, какая почта зарегистрирована: {answers}"

    # --- забытый пароль без телеграма: код слать некуда, но почта не выдаётся ---
    quiet = main.auth_forgot(main.AuthIn(email="kot@primer.ru"))
    unknown = main.auth_forgot(main.AuthIn(email="nikogo@primer.ru"))
    assert quiet["sent"] is False and unknown["sent"] is False
    assert quiet["hint"] == unknown["hint"], "по подсказке видно, кто у нас есть"

    # --- смена пароля по коду ---
    # OR REPLACE: запрос кода выше уже завёл строку, даже если отправить было некуда
    with main.db() as conn:
        conn.execute(
            "INSERT OR REPLACE INTO auth_reset(email, code_hash, expires, tries) VALUES(?, ?, ?, 0)",
            ("kot@primer.ru", main._token_hash("4242"), main.time.time() + 900),
        )
    try:
        main.auth_reset(main.ResetIn(
            email="kot@primer.ru", code="000000", password="novyparol1"))
        raise AssertionError("пустили с неверным кодом")
    except HTTPException as error:
        assert error.status_code == 403, error.status_code

    done = body(main.auth_reset(main.ResetIn(
        email="kot@primer.ru", code="4242", password="novyparol1")))
    assert done["profile"]["code"] == before["code"]

    # старый пароль больше не работает, новый работает
    try:
        main.auth_login(main.AuthIn(email="kot@primer.ru", password="tochki123"))
        raise AssertionError("старый пароль остался рабочим")
    except HTTPException as error:
        assert error.status_code == 403, error.status_code
    assert body(main.auth_login(main.AuthIn(
        email="kot@primer.ru", password="novyparol1")))["profile"]["code"] == before["code"]

    # код одноразовый
    try:
        main.auth_reset(main.ResetIn(
            email="kot@primer.ru", code="4242", password="ещёодин1"))
        raise AssertionError("код сработал второй раз")
    except HTTPException as error:
        assert error.status_code == 403, error.status_code

    # --- статус доступа показывает привязанную почту ---
    with main.db() as conn:
        state = main._profile_access_state(conn, before["code"])
    assert state["email"] == "kot@primer.ru", state

    # --- письмо с кодом: когда почта настроена, код уходит на неё ---
    letters = []

    def fake_mail(to, subject, text):
        letters.append((to, subject, text))
        return True

    main.MAIL_ON = True
    main._mail_send = fake_mail

    answer = main.auth_forgot(main.AuthIn(email="kot@primer.ru"))
    assert len(letters) == 1 and letters[0][0] == "kot@primer.ru", letters
    code = re.search(r"\b(\d{4})\b", letters[0][2]).group(1)
    assert code in letters[0][1], f"кода нет в теме письма: {letters[0][1]}"

    # второй запрос подряд не заваливает ящик ещё одним письмом
    main.auth_forgot(main.AuthIn(email="kot@primer.ru"))
    assert len(letters) == 1, "письмо ушло второй раз подряд"

    # на незарегистрированную почту не пишем, а отвечаем слово в слово так же
    stranger = main.auth_forgot(main.AuthIn(email="nikogo@primer.ru"))
    assert len(letters) == 1, "написали на чужую почту"
    assert stranger == answer, f"по ответу видно, кто у нас есть: {stranger} / {answer}"

    # код из письма меняет пароль
    done_mail = body(main.auth_reset(main.ResetIn(
        email="kot@primer.ru", code=code, password="izpisma12")))
    assert done_mail["profile"]["code"] == before["code"]
    assert body(main.auth_login(main.AuthIn(
        email="kot@primer.ru", password="izpisma12")))["profile"]["code"] == before["code"]

    # --- почта отвалилась, но телеграм привязан: код уходит туда ---
    tg_out = []
    main._mail_send = lambda to, subject, text: False
    main._tg_send = lambda chat_id, text: tg_out.append((chat_id, text)) or True
    with main.db() as conn:
        conn.execute(
            "INSERT INTO profile_telegram(tg_id, profile_code) VALUES(?, ?)",
            ("77007", before["code"]),
        )
    main.auth_forgot(main.AuthIn(email="kot@primer.ru"))
    assert tg_out and tg_out[0][0] == "77007", f"код не ушёл в телеграм: {tg_out}"
    tg_code = re.search(r"\b(\d{4})\b", tg_out[0][1]).group(1)
    assert body(main.auth_reset(main.ResetIn(
        email="kot@primer.ru", code=tg_code, password="iztelegi12")))["profile"]["code"] == before["code"]

    # --- отправка через RuSender: проверяем сам запрос, никуда не ходим ---
    import urllib.request

    calls = []

    class FakeResponse:
        def read(self):
            return b"{}"

        def __enter__(self):
            return self

        def __exit__(self, *rest):
            return False

    real_urlopen = urllib.request.urlopen
    urllib.request.urlopen = lambda req, timeout=None: (calls.append(req), FakeResponse())[1]

    main.RUSENDER_KEY = "rs_ck_v1_test"
    main.RUSENDER_SEND_KEY = "7"
    main.MAIL_FROM = "vita@vitadots.ru"
    main.MAIL_FROM_NAME = "Vita"

    assert main._mail_send_api("kot@primer.ru", "4242 — код", "Код: 4242") is True
    sent = calls[0]
    assert sent.full_url.endswith("/external-mails/send/7"), sent.full_url
    assert sent.get_header("Authorization") == "Bearer rs_ck_v1_test"
    payload = json.loads(sent.data)
    assert payload["mail"]["to"]["email"] == "kot@primer.ru"
    assert payload["mail"]["from"]["email"] == "vita@vitadots.ru", payload["mail"]["from"]
    assert payload["mail"]["subject"].startswith("4242")
    assert "4242" in payload["mail"]["text"]
    assert payload["idempotencyKey"], "нет ключа одноразовости — повтор задвоит письмо"

    # сервис лёг — ручка не падает, а честно говорит «не отправили»
    def boom(req, timeout=None):
        raise RuntimeError("503 Service Unavailable")

    urllib.request.urlopen = boom
    assert main._mail_send_api("kot@primer.ru", "тема", "текст") is False
    urllib.request.urlopen = real_urlopen

print("Vita auth: passed")
