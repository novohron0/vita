"""Админка на /me: prime по тегу выдаёт только владелец профиля @kam."""
import os
import sys
import tempfile
from pathlib import Path

from fastapi import HTTPException

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

with tempfile.TemporaryDirectory(prefix="vita-admin-") as data_dir:
    os.environ["VITA_DATA"] = data_dir
    from app import main

    class FakeRequest:
        base_url = "http://testserver/"

    admin_token = "admin-token-" + "1" * 24
    user_token = "user-token-" + "2" * 24
    stranger_token = "stranger-token-" + "3" * 24

    main.ensure_profile(main.ProfileIn(ownerToken=admin_token))
    main.ensure_profile(main.ProfileIn(ownerToken=user_token))
    main.ensure_profile(main.ProfileIn(ownerToken=stranger_token))

    # тег админа зарезервирован: чужой его не займёт и админку не получит
    try:
        main.update_profile(main.ProfileUpdateIn(ownerToken=stranger_token, handle="kam"))
        raise AssertionError("чужой не должен занимать тег админа")
    except HTTPException as exc:
        assert exc.status_code == 409, exc.status_code

    # владельцу тег ставим так же, как на проде — через админскую ручку
    main.admin_set_handle(
        code=main.ensure_profile(main.ProfileIn(ownerToken=admin_token))["code"],
        handle="kam", token=main.ADMIN_TOKEN,
    )
    me = main.ensure_profile(main.ProfileIn(ownerToken=admin_token))
    assert me["admin"] is True, "у @kam карта админки видна"

    target = main.update_profile(main.ProfileUpdateIn(ownerToken=user_token, handle="masha_test"))
    assert target["admin"] is False, "у обычного человека админки нет"

    link = main.create_link(main.LinkIn(ownerToken=user_token, title="Проба"), FakeRequest())
    assert link["until"], "на пробе стоит дата окончания"

    # не админ — отказ
    try:
        main.admin_prime(main.AdminPrimeIn(ownerToken=user_token, tag="masha_test"))
        raise AssertionError("обычный человек не выдаёт prime")
    except HTTPException as exc:
        assert exc.status_code == 403, exc.status_code

    # без Vita ID — тоже отказ
    try:
        main.admin_prime(main.AdminPrimeIn(ownerToken="", tag="masha_test"))
        raise AssertionError("без токена выдачи быть не должно")
    except HTTPException as exc:
        assert exc.status_code in (401, 422), exc.status_code

    # нет такого тега — 404
    try:
        main.admin_prime(main.AdminPrimeIn(ownerToken=admin_token, tag="net_takogo"))
        raise AssertionError("нет профиля — нет выдачи")
    except HTTPException as exc:
        assert exc.status_code == 404, exc.status_code

    # выдача: и профиль, и его обои становятся вечными
    out = main.admin_prime(main.AdminPrimeIn(ownerToken=admin_token, tag="@Masha_Test"))
    assert out == {"tag": "masha_test", "wallpapers": 1, "paid": True}, out

    state = main.access_state(main.OwnerIn(ownerToken=user_token))
    assert state["paid"] is True and state["until"] is None, state
    with main.db() as conn:
        rows = [r[0] for r in conn.execute("SELECT access_until FROM links WHERE code = ?", (link["code"],))]
    assert rows == [None], rows

    # новые обои того же человека тоже сразу вечные
    later = main.create_link(main.LinkIn(ownerToken=user_token, title="Вторые"), FakeRequest())
    assert later["until"] is None, later

    # список «кому выдан»: видит только админ, в нём выданный руками тег,
    # а сам админ и купившие через кассу туда не попадают
    try:
        main.admin_primes(main.AdminPrimeIn(ownerToken=user_token))
        raise AssertionError("список выданных показали не админу")
    except HTTPException as exc:
        assert exc.status_code == 403, exc.status_code
    listed = main.admin_primes(main.AdminPrimeIn(ownerToken=admin_token))["items"]
    assert [item["tag"] for item in listed] == ["masha_test"], listed
    assert len(listed[0]["at"]) == 10, listed

    # коронка: prime виден в профиле и на публичной странице
    with main.db() as conn:
        masha = conn.execute("SELECT code FROM profiles WHERE handle = 'masha_test'").fetchone()[0]
        assert main._public_profile_payload(conn, handle="masha_test")["prime"] is True
        assert main._profile_payload(conn, masha)["prime"] is True
        assert main._public_profile_payload(conn, handle="kam")["prime"] is False
    print("ok: админка выдаёт prime только с профиля @kam")
