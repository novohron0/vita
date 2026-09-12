#!/bin/sh
# Новая ссылка на ярлык «Команды»: sh scripts/shortcut-url.sh https://www.icloud.com/shortcuts/...
#
# Ссылка живёт в .env как SHORTCUT_ICLOUD_URL — по ней кнопка «Добавить ярлык»
# на странице установки. iCloud выдаёт НОВУЮ ссылку каждый раз, когда ярлык
# пересобирают и делятся заново, поэтому после правки ярлыка её надо заменить.
#
# Запускать на сервере: ssh root@138.124.51.182 'cd ~/vita && sh scripts/shortcut-url.sh <ссылка>'
set -e
cd "$(dirname "$0")/.."

URL="$1"
case "$URL" in
  https://www.icloud.com/shortcuts/*) ;;
  *) echo "нужна ссылка вида https://www.icloud.com/shortcuts/xxxx"; exit 1 ;;
esac

[ -f .env ] || { echo "рядом нет .env — этот скрипт для сервера"; exit 1; }
command -v docker >/dev/null || { echo "нет docker — это не прод"; exit 1; }

# проверяем, что ярлык по ссылке вправду лежит в iCloud и подписан
ID=$(printf '%s' "$URL" | sed 's#.*/##')
if command -v curl >/dev/null; then
  curl -sf "https://www.icloud.com/shortcuts/api/records/$ID" >/dev/null \
    || { echo "iCloud не отдаёт ярлык по этой ссылке — проверь адрес"; exit 1; }
fi

cp .env ".env.bak.$(date +%Y%m%d-%H%M%S)"
if grep -q '^SHORTCUT_ICLOUD_URL=' .env; then
  sed -i "s#^SHORTCUT_ICLOUD_URL=.*#SHORTCUT_ICLOUD_URL=$URL#" .env
else
  printf 'SHORTCUT_ICLOUD_URL=%s\n' "$URL" >> .env
fi

docker compose up -d
echo "ссылка на ярлык обновлена: $URL"
