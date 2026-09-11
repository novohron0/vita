"""Вход по почте и паролю: регистрация, вход, смена забытого пароля.

Гоняется на временном каталоге — боевую ~/vita/data трогать нельзя.
"""
import json
import os
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
    with main.db() as conn:
        conn.execute(
            "INSERT INTO auth_reset(email, code_hash, expires, tries) VALUES(?, ?, ?, 0)",
            ("kot@primer.ru", main._token_hash("424242"), main.time.time() + 900),
        )
    try:
        main.auth_reset(main.ResetIn(
            email="kot@primer.ru", code="000000", password="novyparol1"))
        raise AssertionError("пустили с неверным кодом")
    except HTTPException as error:
        assert error.status_code == 403, error.status_code

    done = body(main.auth_reset(main.ResetIn(
        email="kot@primer.ru", code="424242", password="novyparol1")))
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
            email="kot@primer.ru", code="424242", password="ещёодин1"))
        raise AssertionError("код сработал второй раз")
    except HTTPException as error:
        assert error.status_code == 403, error.status_code

    # --- статус доступа показывает привязанную почту ---
    with main.db() as conn:
        state = main._profile_access_state(conn, before["code"])
    assert state["email"] == "kot@primer.ru", state

print("Vita auth: passed")
