#!/bin/sh
# Копирует единый реестр в сайт и расширение
set -e
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cp "$ROOT/focus/shared/registry.json" "$ROOT/static/focus-registry.json"
cp "$ROOT/focus/shared/registry.json" "$ROOT/focus/extension/shared/registry.json"
echo "registry synced"
