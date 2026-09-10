#!/bin/sh
# Ежедневный бэкап базы Vita. Запускать НА СЕРВЕРЕ (cron), не на маке.
# Копия снимается средствами sqlite — при WAL простой cp базу бьёт.
set -e
cd "$(dirname "$0")/.."
STAMP=$(date +%Y-%m-%d)
mkdir -p data/backup
docker compose exec -T vita python -c "
import sqlite3
src = sqlite3.connect('/app/data/vita.db')
dst = sqlite3.connect('/app/data/backup/vita-$STAMP.db')
src.backup(dst)
dst.close(); src.close()
"
gzip -f "data/backup/vita-$STAMP.db"
# держим две недели истории
find data/backup -name 'vita-*.db.gz' -mtime +14 -delete
echo "backup ok: data/backup/vita-$STAMP.db.gz"
