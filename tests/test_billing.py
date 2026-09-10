"""Оплата: подпись Робокассы, выдача вечного доступа, идемпотентность.

Деньги — самое хрупкое место, поэтому проверяем не только счастливый путь,
но и чужую подпись, заниженную сумму и повторное уведомление.
"""
import hashlib
import os
import sqlite3
import sys
import tempfile
from pathlib import Path

from fastapi import HTTPException
from starlette.requests import Request

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))


def request(path: str = "/", query: str = "") -> Request:
    return Request({
        "type": "http", "http_version": "1.1", "method": "GET",
        "scheme": "https", "path": path, "raw_path": path.encode(),
        "query_string": query.encode(), "headers": [(b"host", b"vitadots.ru")],
        "server": ("vitadots.ru", 443), "client": ("185.59.216.65", 1),
        "root_path": "",
    })


def md5(raw: str) -> str:
    return hashlib.md5(raw.encode("utf-8")).hexdigest()


with tempfile.TemporaryDirectory(prefix="vita-billing-") as data_dir:
    os.environ["VITA_DATA"] = data_dir
    os.environ["ROBOKASSA_LOGIN"] = "vitashop"
    os.environ["ROBOKASSA_PASS1"] = "pass-one"
    os.environ["ROBOKASSA_PASS2"] = "pass-two"
    os.environ["ROBOKASSA_TEST"] = "1"
    os.environ.pop("ROBOKASSA_SNO", None)

    from app import billing, main

    token = "billing-token-" + "9" * 24

    # 1. Обои достаются без анкеты: 7 дней пробы получают все.
    link = main.create_link(main.LinkIn(ownerToken=token), request())
    assert link["until"] is not None, "новичку положена проба, а не вечный доступ"

    with main.db() as conn:
        profile_code = main._profile_for_token(conn, token)
        state = main._profile_access_state(conn, profile_code)
    assert state["paid"] is False and state["expired"] is False
    assert state["until"] == link["until"]
    assert state["payable"] is True and state["price"] == billing.PRICE

    # 2. Счёт: подпись ровно по документации Робокассы.
    order = main.buy(main.BuyIn(ownerToken=token, email="Kamil@Example.RU "))
    inv_id = order["invId"]
    fields = order["fields"]
    assert order["action"] == "https://auth.robokassa.ru/Merchant/Index.aspx"
    assert fields["OutSum"] == "590.00" and fields["InvId"] == str(inv_id)
    assert fields["Email"] == "kamil@example.ru", "почту чистим до записи в счёт"
    assert fields["IsTest"] == "1"
    assert fields["SignatureValue"] == md5(f"vitashop:590.00:{inv_id}:pass-one")

    # кривая почта до Робокассы не доходит
    try:
        main.buy(main.BuyIn(ownerToken=token, email="без-собаки"))
        raise AssertionError("почта без @ должна отбиваться")
    except HTTPException as exc:
        assert exc.status_code == 422

    # 3. Чужая подпись доступ не открывает.
    bad = {"OutSum": "590.00", "InvId": str(inv_id), "SignatureValue": md5("подделка")}
    try:
        main._pay_result(bad)
        raise AssertionError("чужая подпись не должна проходить")
    except HTTPException as exc:
        assert exc.status_code == 403

    # 4. Заниженная сумма с верной подписью — тоже нет.
    cheap = {
        "OutSum": "1.00", "InvId": str(inv_id),
        "SignatureValue": md5(f"1.00:{inv_id}:pass-two"),
    }
    try:
        main._pay_result(cheap)
        raise AssertionError("оплата меньше цены не открывает доступ")
    except HTTPException as exc:
        assert exc.status_code == 400

    with main.db() as conn:
        assert main._profile_access_state(conn, profile_code)["paid"] is False

    # 5. Настоящее уведомление: доступ навсегда и ответ OK{InvId}.
    good = {
        "OutSum": "590.00", "InvId": str(inv_id),
        "SignatureValue": md5(f"590.00:{inv_id}:pass-two").upper(),  # регистр не важен
    }
    assert main._pay_result(good) == f"OK{inv_id}"

    with main.db() as conn:
        state = main._profile_access_state(conn, profile_code)
        assert state["paid"] is True and state["until"] is None
        # старые обои тоже перестают быть временными
        assert conn.execute(
            "SELECT access_until FROM links WHERE code = ?", (link["code"],)
        ).fetchone()[0] is None
        paid_rows = conn.execute(
            "SELECT status, email FROM orders WHERE id = ?", (inv_id,)
        ).fetchone()
        assert paid_rows == ("paid", "kamil@example.ru")

    # 6. Повторное уведомление ничего не ломает (Робокасса шлёт их несколько раз).
    assert main._pay_result(good) == f"OK{inv_id}"

    # 7. Новые обои купившего сразу вечные, а второй раз платить не дают.
    second = main.create_link(main.LinkIn(ownerToken=token), request())
    assert second["until"] is None
    try:
        main.buy(main.BuyIn(ownerToken=token, email="kamil@example.ru"))
        raise AssertionError("повторная покупка должна отбиваться")
    except HTTPException as exc:
        assert exc.status_code == 409

    # 8. Возврат на SuccessURL: подпись считается Паролем#1.
    ok_query = f"OutSum=590.00&InvId={inv_id}&SignatureValue={md5(f'590.00:{inv_id}:pass-one')}"
    page = main.pay_success(request("/pay/success", ok_query))
    assert b'data-state="paid"' in page.body
    assert billing.check_success({
        "OutSum": "590.00", "InvId": str(inv_id), "SignatureValue": md5("подделка"),
    }) is None

    # 9. Без ключей магазина оплата честно отключена.
    saved = billing.LOGIN
    billing.LOGIN = ""
    try:
        main.buy(main.BuyIn(ownerToken="another-token-" + "8" * 24, email="a@b.ru"))
        raise AssertionError("без ключей покупка недоступна")
    except HTTPException as exc:
        assert exc.status_code == 503
    finally:
        billing.LOGIN = saved

    # 10. Чек НПД: если задана система налогообложения, он входит в подпись.
    billing.SNO = "npd"
    receipt_order = main.buy(main.BuyIn(ownerToken="third-token-" + "7" * 24, email="c@d.ru"))
    receipt = receipt_order["fields"]["Receipt"]
    assert '"sno":"npd"' in receipt and '"sum":590.00' in receipt
    assert receipt_order["fields"]["SignatureValue"] == md5(
        f"vitashop:590.00:{receipt_order['invId']}:{receipt}:pass-one"
    )
    billing.SNO = ""

print("Vita billing: passed")
