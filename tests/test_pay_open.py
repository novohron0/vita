"""Магазин Робокассы ещё не включён — человек не должен упираться в их «ошибку 25».

Сайт сам открывает страницу оплаты, видит код и честно пишет «оплата откроется
на днях». Как только магазин включат, кнопка оживает без команд и перезапуска.
"""
import os
import sys
import tempfile
import urllib.request
from pathlib import Path

from fastapi import HTTPException

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

# так Робокасса отдаёт данные страницы оплаты: код ошибки лежит в RoboxContext
CLOSED = ('<script>var RoboxContext = {"order":null,'
          '"error":{"header":null,"message":null,"code":25},"opKey":null};</script>')
OPEN = '<script>var RoboxContext = {"order":{"sum":590},"error":null,"opKey":null};</script>'


class Page:
    def __init__(self, body: str):
        self.body = body.encode()

    def read(self, limit: int = -1) -> bytes:
        return self.body

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        return False


with tempfile.TemporaryDirectory(prefix="vita-payopen-") as data_dir:
    os.environ["VITA_DATA"] = data_dir
    os.environ["ROBOKASSA_LOGIN"] = "vitashop"
    os.environ["ROBOKASSA_PASS1"] = "pass-one"
    os.environ["ROBOKASSA_PASS2"] = "pass-two"
    os.environ["ROBOKASSA_TEST"] = "0"
    os.environ.pop("ROBOKASSA_SNO", None)
    os.environ.pop("VITA_DEV", None)

    from app import billing, main

    calls = []
    answer = {"page": CLOSED}

    def fake_urlopen(req, timeout=None):
        calls.append(req.full_url)
        if isinstance(answer["page"], Exception):
            raise answer["page"]
        return Page(answer["page"])

    urllib.request.urlopen = fake_urlopen
    token = "payopen-token-" + "7" * 24

    def orders() -> int:
        with main.db() as conn:
            return conn.execute("SELECT COUNT(*) FROM orders").fetchone()[0]

    # 1. Магазин закрыт: счёт не выставляется, человек читает понятную фразу.
    try:
        main.buy(main.BuyIn(ownerToken=token, email="a@example.ru"))
        raise AssertionError("пока магазин не включён, счёт выставлять нельзя")
    except HTTPException as exc:
        assert exc.status_code == 503 and "откроется" in exc.detail
    assert orders() == 0, "пустых счетов в базе остаться не должно"
    assert len(calls) == 1
    assert "MerchantLogin=vitashop" in calls[0] and "InvId=0" in calls[0]
    assert "IsTest" not in calls[0]

    # страница /buy знает это заранее и форму не показывает
    assert "const PAY_OPEN = '0'" in main.buy_page().body.decode()
    assert len(calls) == 1, "ответ помним пару минут, а не спрашиваем на каждый заход"

    # 2. Магазин включили: через пару минут кнопка оживает сама.
    answer["page"] = OPEN
    main._pay_probe["at"] -= main.PAY_WAIT_TTL + 1
    order = main.buy(main.BuyIn(ownerToken=token, email="a@example.ru"))
    assert order["fields"]["MerchantLogin"] == "vitashop" and "IsTest" not in order["fields"]
    assert orders() == 1
    assert "const PAY_OPEN = '1'" in main.buy_page().body.decode()
    assert len(calls) == 2, "открывшийся магазин больше не переспрашиваем"

    # 3. Робокасса не ответила — платить не мешаем.
    main._pay_probe.update(open=None, at=0.0)
    answer["page"] = OSError("timed out")
    assert main._robokassa_open() is True
    assert main._pay_probe["open"] is None, "сбой связи не запоминаем как ответ"

    # 4. В тестовом режиме никуда не ходим.
    billing.IS_TEST = True
    before = len(calls)
    assert main._robokassa_open() is True and len(calls) == before

print("ok: pay open")
