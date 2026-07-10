#!/bin/sh
# Быстрая проверка доступности vitadots.ru (запускать с Mac или сервера)
set -e
DOMAIN="${VITA_DOMAIN:-vitadots.ru}"
WWW="www.${DOMAIN}"

echo "=== DNS ==="
echo -n "$DOMAIN A: "; dig +short "$DOMAIN" A | head -1 || echo "(нет)"
echo -n "$WWW A:   "; dig +short "$WWW" A | head -1 || echo "(нет — добавь A-запись у регистратора)"

echo "=== HTTPS ==="
for host in "$DOMAIN" "$WWW"; do
  code=$(curl -sS -o /dev/null -w '%{http_code}' --max-time 12 "https://${host}/" 2>/dev/null || echo "000")
  echo "$host -> HTTP $code"
done

echo "=== Сертификат $DOMAIN ==="
echo | openssl s_client -connect "${DOMAIN}:443" -servername "$DOMAIN" 2>/dev/null \
  | openssl x509 -noout -dates -subject 2>/dev/null || echo "не удалось прочитать"

echo "=== Страницы ==="
for path in / /focus /goals /feed; do
  code=$(curl -sS -o /dev/null -w '%{http_code}' --max-time 12 "https://${DOMAIN}${path}" 2>/dev/null || echo "000")
  echo "https://${DOMAIN}${path} -> $code"
done
