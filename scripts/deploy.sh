#!/bin/sh
# Деплой Vita на прод: git pull + docker rebuild
set -e
HOST="${VITA_HOST:-root@138.124.51.182}"
ssh -o ConnectTimeout=15 "$HOST" 'cd ~/vita && git pull && docker compose up -d --build'
echo "deploy ok: https://vitadots.ru"
