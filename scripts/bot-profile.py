#!/usr/bin/env python3
"""Оформление бота Vita: описание в пустом чате, строка в профиле и меню команд.

Сами экраны («Главное меню», «Продукты», «О нас») живут в app/main.py, здесь —
только то, что телеграм хранит у себя. Запускать после правки текстов:

    python3 scripts/bot-profile.py

Токен берётся из TG_BOT_TOKEN или из .env рядом с кодом. Аву ставит владелец
в @BotFather — её скрипт не трогает.
"""
import json
import os
import sys
import urllib.error
import urllib.request
from pathlib import Path

PRICE = os.environ.get("VITA_PRICE", "590")

DESCRIPTION = (
    "⠿ vita — живые обои-календарь для айфона\n\n"
    "Каждую ночь на экране блокировки закрашивается новая точка. "
    "Месяц, год, вся жизнь или своя цель — время всегда перед глазами.\n\n"
    "✓ обои за 30 секунд, без приложения\n"
    "✓ обновляются сами, каждую ночь\n"
    f"✓ 7 дней бесплатно, дальше {PRICE} ₽ навсегда"
)
SHORT = "Живые обои-календарь для айфона: каждую ночь закрашивается новая точка. vitadots.ru"
COMMANDS = [
    {"command": "start", "description": "Главное меню"},
    {"command": "products", "description": "Продукты"},
    {"command": "about", "description": "О нас"},
]


def token() -> str:
    value = os.environ.get("TG_BOT_TOKEN", "").strip()
    env = Path(__file__).resolve().parents[1] / ".env"
    if not value and env.exists():
        for line in env.read_text(encoding="utf-8").splitlines():
            if line.startswith("TG_BOT_TOKEN="):
                value = line.split("=", 1)[1].strip().strip("'\"")
    if not value:
        sys.exit("нет TG_BOT_TOKEN: ни в окружении, ни в .env")
    return value


def call(bot: str, method: str, payload: dict) -> dict:
    req = urllib.request.Request(
        f"https://api.telegram.org/bot{bot}/{method}",
        data=json.dumps(payload).encode("utf-8"),
        headers={"Content-Type": "application/json"},
    )
    try:
        with urllib.request.urlopen(req, timeout=20) as resp:
            return json.loads(resp.read())
    except urllib.error.HTTPError as exc:
        return json.loads(exc.read() or b"{}")


def main() -> None:
    assert len(DESCRIPTION) <= 512 and len(SHORT) <= 120, "телеграм не примет такой длины"
    bot = token()
    steps = [
        ("setMyDescription", {"description": DESCRIPTION}),
        ("setMyShortDescription", {"short_description": SHORT}),
        # только в личке: в чате отзывов команды бота не нужны
        ("setMyCommands", {"commands": COMMANDS, "scope": {"type": "all_private_chats"}}),
    ]
    failed = False
    for method, payload in steps:
        res = call(bot, method, payload)
        failed |= not res.get("ok")
        print(method, "ok" if res.get("ok") else res.get("description"))
    sys.exit(1 if failed else 0)


if __name__ == "__main__":
    main()
