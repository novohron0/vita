"""Оплата через Робокассу: одна вечная покупка доступа к Vita.

Подписка убрана — человек платит один раз, доступ у профиля остаётся навсегда.
Ключи магазина живут в .env (см. README); пока их нет, оплата выключена и
сайт честно пишет «оплата скоро», а не роняет 500.
"""
import hashlib
import os
from urllib.parse import quote

PAY_URL = "https://auth.robokassa.ru/Merchant/Index.aspx"

# цена в рублях одной строкой — она же уходит в чек и в подпись
PRICE = os.environ.get("VITA_PRICE", "590")
PRODUCT_NAME = "Vita — бессрочный доступ к живым обоям"

LOGIN = os.environ.get("ROBOKASSA_LOGIN", "").strip()
PASS1 = os.environ.get("ROBOKASSA_PASS1", "").strip()
PASS2 = os.environ.get("ROBOKASSA_PASS2", "").strip()
IS_TEST = os.environ.get("ROBOKASSA_TEST", "0").strip() == "1"
# Система налогообложения для чека. Пусто = Receipt не передаём совсем
# (у самозанятого на Робочеках СМЗ чек формирует сама Робокасса).
SNO = os.environ.get("ROBOKASSA_SNO", "").strip()

# ЛК Робокассы отдаёт уведомления только с этих адресов — на всякий случай
# пишем их в лог, если пришло с чужого IP (блокировать нельзя: за Caddy IP может
# теряться, а терять оплату хуже, чем принять лишний запрос с верной подписью).
RESULT_IPS = ("185.59.216.65", "185.59.217.65")


def enabled() -> bool:
    return bool(LOGIN and PASS1 and PASS2)


def amount() -> str:
    """Сумма в формате Робокассы: 590.00 — ровно в таком виде идёт в подпись."""
    return f"{float(PRICE):.2f}"


def _md5(raw: str) -> str:
    return hashlib.md5(raw.encode("utf-8")).hexdigest()


def _receipt_json() -> str:
    """Минимизированный JSON чека. Пустая строка = чек не передаём."""
    if not SNO:
        return ""
    # без пробелов: подпись считается ровно по этой строке
    return (
        '{"sno":"' + SNO + '","items":[{"name":"' + PRODUCT_NAME + '",'
        '"quantity":1,"sum":' + amount() + ',"payment_method":"full_payment",'
        '"payment_object":"service","tax":"none"}]}'
    )


def payment_form(inv_id: int, email: str) -> dict:
    """Поля формы, которую фронт отправляет POST-ом на страницу Робокассы.

    POST выбран намеренно: чек (Receipt) уходит обычным полем формы, и не нужно
    гадать про двойное URL-кодирование, из-за которого ломается подпись.
    """
    out_sum = amount()
    receipt = _receipt_json()
    # Порядок строго по документации: MerchantLogin:OutSum:InvId:Receipt:Пароль#1
    parts = [LOGIN, out_sum, str(inv_id)]
    if receipt:
        parts.append(receipt)
    parts.append(PASS1)
    fields = {
        "MerchantLogin": LOGIN,
        "OutSum": out_sum,
        "InvId": str(inv_id),
        "Description": PRODUCT_NAME,
        "SignatureValue": _md5(":".join(parts)),
        "Culture": "ru",
        "Encoding": "utf-8",
    }
    if receipt:
        fields["Receipt"] = receipt
    if email:
        fields["Email"] = email
    if IS_TEST:
        fields["IsTest"] = "1"
    return {"action": PAY_URL, "fields": fields}


def payment_link(inv_id: int, email: str) -> str:
    """Запасной GET-вариант той же оплаты — для писем и ручной отправки ссылки."""
    form = payment_form(inv_id, email)
    query = "&".join(f"{k}={quote(str(v), safe='')}" for k, v in form["fields"].items())
    return f"{PAY_URL}?{query}"


def check_result(params: dict) -> tuple[int, str] | None:
    """Проверка уведомления об оплате (Пароль#2). Возвращает (InvId, сумма)."""
    out_sum = str(params.get("OutSum") or params.get("outSum") or "")
    inv_raw = str(params.get("InvId") or params.get("invId") or "")
    got = str(params.get("SignatureValue") or params.get("signatureValue") or "")
    if not (out_sum and inv_raw and got):
        return None
    try:
        inv_id = int(inv_raw)
    except ValueError:
        return None
    # Shp_-параметры мы не передаём, но если Робокасса вернёт свои — они входят
    # в подпись по алфавиту, иначе проверка ложно провалится.
    shp = sorted(
        (k, v) for k, v in params.items() if k.lower().startswith("shp_")
    )
    raw = ":".join([out_sum, inv_raw, PASS2] + [f"{k}={v}" for k, v in shp])
    if _md5(raw).lower() != got.lower():
        return None
    return inv_id, out_sum


def check_success(params: dict) -> int | None:
    """Проверка возврата покупателя на SuccessURL (Пароль#1)."""
    out_sum = str(params.get("OutSum") or "")
    inv_raw = str(params.get("InvId") or "")
    got = str(params.get("SignatureValue") or "")
    if not (out_sum and inv_raw and got):
        return None
    try:
        inv_id = int(inv_raw)
    except ValueError:
        return None
    shp = sorted((k, v) for k, v in params.items() if k.lower().startswith("shp_"))
    raw = ":".join([out_sum, inv_raw, PASS1] + [f"{k}={v}" for k, v in shp])
    if _md5(raw).lower() != got.lower():
        return None
    return inv_id
