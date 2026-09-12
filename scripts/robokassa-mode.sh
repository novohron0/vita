#!/bin/sh
# Переключатель режима оплаты: sh scripts/robokassa-mode.sh live | test
#
# В .env на сервере рабочие ключи магазина — ROBOKASSA_PASS1/2, боевые лежат
# отдельно как ROBOKASSA_PROD_PASS1/2. Руками их местами не переставляем.
#
# Скрипт: кладёт рядом копию .env, при первом переходе в бой прячет нынешние
# тестовые пароли в ROBOKASSA_TEST_PASS1/2 (иначе они затрутся без возврата),
# ставит в рабочие ключи нужную пару и правит ROBOKASSA_TEST.
#
# Запускать на сервере. Путь ~/vita одинаков на маке и на сервере, поэтому
# скрипт сам проверяет, что рядом есть .env и docker, и иначе ничего не делает.
set -e
cd "$(dirname "$0")/.."

MODE="$1"
case "$MODE" in
  live|test) ;;
  *) echo "как звать: sh scripts/robokassa-mode.sh live | test"; exit 1 ;;
esac

[ -f .env ] || { echo "рядом нет .env — этот скрипт для сервера"; exit 1; }
command -v docker >/dev/null || { echo "нет docker — это не прод"; exit 1; }

cp .env ".env.bak.$(date +%Y%m%d-%H%M%S)"

MODE="$MODE" python3 - <<'PY'
import io, os

mode = os.environ["MODE"]
path = ".env"
lines = io.open(path, encoding="utf-8").read().split("\n")

have = {}
for line in lines:
    if "=" in line and not line.lstrip().startswith("#"):
        key, _, value = line.partition("=")
        have[key.strip()] = value

was_test = have.get("ROBOKASSA_TEST", "").strip() == "1"
keep = []

if mode == "live":
    src1, src2 = "ROBOKASSA_PROD_PASS1", "ROBOKASSA_PROD_PASS2"
    # нынешние рабочие ключи тестовые — прячем их, чтобы был путь назад
    if was_test and not have.get("ROBOKASSA_TEST_PASS1"):
        keep = [
            "ROBOKASSA_TEST_PASS1=" + have.get("ROBOKASSA_PASS1", ""),
            "ROBOKASSA_TEST_PASS2=" + have.get("ROBOKASSA_PASS2", ""),
        ]
else:
    src1, src2 = "ROBOKASSA_TEST_PASS1", "ROBOKASSA_TEST_PASS2"

missing = [k for k in (src1, src2) if not have.get(k)]
if missing:
    raise SystemExit("в .env нет " + ", ".join(missing) + " — ничего не меняю")

out = []
for line in lines:
    key = line.partition("=")[0].strip() if "=" in line else ""
    if key == "ROBOKASSA_PASS1":
        out.append("ROBOKASSA_PASS1=" + have[src1])
    elif key == "ROBOKASSA_PASS2":
        out.append("ROBOKASSA_PASS2=" + have[src2])
    elif key == "ROBOKASSA_TEST":
        out.append("ROBOKASSA_TEST=" + ("0" if mode == "live" else "1"))
    else:
        out.append(line)

if keep:
    while out and not out[-1].strip():
        out.pop()
    out += keep + [""]

io.open(path, "w", encoding="utf-8").write("\n".join(out))
print("режим оплаты теперь:", "боевой" if mode == "live" else "тестовый")
PY

docker compose up -d
echo "готово. проверь страницу оплаты: https://vitadots.ru/buy"
