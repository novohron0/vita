#!/bin/sh
# Чат для отзывов: бот @vitadots_bot пересказывает туда каждый отзыв со звёздами
# строкой «5 звёзд · @ник пишет: текст».
#
# 1. Добавь @vitadots_bot в чат Vita обычным участником.
# 2. На сервере: ssh root@138.124.51.182 'cd ~/vita && sh scripts/reviews-chat.sh'
#
# Скрипт сам найдёт чат, куда добавили бота, запишет его в .env как
# TG_REVIEWS_CHAT, перезапустит сайт и пришлёт в чат проверочное сообщение.
# Если бот сидит в нескольких чатах — покажет их и попросит номер:
#   sh scripts/reviews-chat.sh -1001234567890
set -e
cd "$(dirname "$0")/.."

[ -f .env ] || { echo "рядом нет .env — этот скрипт для сервера"; exit 1; }
command -v docker >/dev/null || { echo "нет docker — это не прод"; exit 1; }

CHAT="$1"
if [ -z "$CHAT" ]; then
  # чаты запоминает сам бот, когда его добавляют (вебхук пишет их в базу)
  PICK=$(docker compose exec -T vita python - <<'PY'
from app.main import db
with db() as conn:
    rows = conn.execute("SELECT chat_id, title FROM tg_chats ORDER BY seen DESC").fetchall()
named = [r for r in rows if any(w in (r[1] or "").lower() for w in ("vita", "вита"))]
pick = rows if len(rows) == 1 else named
if len(pick) == 1:
    print("ID", pick[0][0], pick[0][1] or "")
else:
    for chat_id, title in rows:
        print("  ", chat_id, title or "без названия")
PY
)
  case "$PICK" in
    "ID "*)
      CHAT=$(printf '%s' "$PICK" | awk '{print $2}')
      echo "нашёл чат: $(printf '%s' "$PICK" | cut -d' ' -f3-)"
      ;;
    "")
      echo "бот пока не видит ни одного чата."
      echo "добавь @vitadots_bot в чат Vita (или удали и добавь заново) и запусти скрипт ещё раз"
      exit 1
      ;;
    *)
      echo "бот сидит в нескольких чатах — запусти ещё раз с номером нужного:"
      printf '%s\n' "$PICK"
      echo "например: sh scripts/reviews-chat.sh -1001234567890"
      exit 1
      ;;
  esac
fi

case "$CHAT" in
  -[0-9]*|[0-9]*) ;;
  *) echo "номер чата — это число, например -1001234567890"; exit 1 ;;
esac

cp .env ".env.bak.$(date +%Y%m%d-%H%M%S)"
[ -z "$(tail -c1 .env)" ] || echo >> .env   # последняя строка без переноса не склеится с новой
if grep -q '^TG_REVIEWS_CHAT=' .env; then
  sed -i "s#^TG_REVIEWS_CHAT=.*#TG_REVIEWS_CHAT=$CHAT#" .env
else
  printf 'TG_REVIEWS_CHAT=%s\n' "$CHAT" >> .env
fi

docker compose up -d
sleep 6
docker compose exec -T vita python - <<'PY'
from app.main import TG_REVIEWS_CHAT, _tg_send
ok = _tg_send(TG_REVIEWS_CHAT, "Сюда будут приходить отзывы Vita со звёздами.")
print("готово: проверочное сообщение ушло в чат" if ok
      else "чат записан, но бот не смог туда написать — проверь, что он в чате и ему можно писать")
PY
