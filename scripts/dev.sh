#!/bin/sh
# Локальный предпросмотр Vita. Данные — во временный каталог: боевую
# ~/vita/data трогать нельзя даже случайно.
set -e
cd "$(dirname "$0")/.."
export VITA_DATA="${VITA_DATA:-/tmp/vita-dev-data}"
mkdir -p "$VITA_DATA"
# тестовый магазин: кнопка оплаты собирается, но настоящих денег не берёт
export ROBOKASSA_LOGIN="${ROBOKASSA_LOGIN:-vita-dev}"
export ROBOKASSA_PASS1="${ROBOKASSA_PASS1:-dev-pass-1}"
export ROBOKASSA_PASS2="${ROBOKASSA_PASS2:-dev-pass-2}"
export ROBOKASSA_TEST="${ROBOKASSA_TEST:-1}"
export SELLER_NAME="${SELLER_NAME:-Имя Фамилия}"
export SELLER_INN="${SELLER_INN:-000000000000}"
export SUPPORT_CONTACT="${SUPPORT_CONTACT:-@vita_support}"
export ADMIN_TOKEN="${ADMIN_TOKEN:-vt-dev}"
# вход через телеграм: локально виджет не заработает (домен не привязан к боту),
# но логика показа блоков проверяется
export TG_BOT_TOKEN="${TG_BOT_TOKEN:-1234567:dev-bot-token}"
export TG_BOT_NAME="${TG_BOT_NAME:-vita_dev_bot}"
exec .venv/bin/python -m uvicorn app.main:app --host 127.0.0.1 --port 8802 --reload
