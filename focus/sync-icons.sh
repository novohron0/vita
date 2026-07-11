#!/bin/sh
# Иконки Focus = apple-touch с vitadots.ru (+ anti-blue tint для Safari)
set -e
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SRC="$ROOT/static/img/apple-touch.png"
EXT="$ROOT/focus/extension"
SAFARI_APP="$ROOT/focus/safari/Vita Focus/Shared (App)"
SAFARI_EXT="$ROOT/focus/safari/Vita Focus/Shared (Extension)/Resources"
ASSET="$SAFARI_APP/Assets.xcassets/AppIcon.appiconset"
PY="$ROOT/focus/scripts/prepare-extension-icons.py"

[ -f "$SRC" ] || { echo "missing $SRC"; exit 1; }
python3 "$PY" "$SRC" "$EXT/icons"
cp "$SRC" "$SAFARI_APP/Resources/Icon.png"

LARGE="$SAFARI_APP/Assets.xcassets/LargeIcon.imageset"
if [ -d "$LARGE" ]; then
  cp "$EXT/icons/icon128.png" "$LARGE/icon128.png"
  cp "$EXT/icons/icon256.png" "$LARGE/icon256.png"
  sips -z 384 384 "$EXT/icons/icon256.png" --out "$LARGE/icon384.png" >/dev/null
fi

if [ -d "$ASSET" ]; then
  sips -z 1024 1024 "$SRC" --out "$ASSET/universal-icon-1024@1x.png" >/dev/null
  sips -z 16 16 "$SRC" --out "$ASSET/mac-icon-16@1x.png" >/dev/null
  sips -z 32 32 "$SRC" --out "$ASSET/mac-icon-16@2x.png" >/dev/null
  sips -z 32 32 "$SRC" --out "$ASSET/mac-icon-32@1x.png" >/dev/null
  sips -z 64 64 "$SRC" --out "$ASSET/mac-icon-32@2x.png" >/dev/null
  sips -z 128 128 "$SRC" --out "$ASSET/mac-icon-128@1x.png" >/dev/null
  sips -z 256 256 "$SRC" --out "$ASSET/mac-icon-128@2x.png" >/dev/null
  sips -z 256 256 "$SRC" --out "$ASSET/mac-icon-256@1x.png" >/dev/null
  sips -z 512 512 "$SRC" --out "$ASSET/mac-icon-256@2x.png" >/dev/null
  sips -z 512 512 "$SRC" --out "$ASSET/mac-icon-512@1x.png" >/dev/null
  sips -z 1024 1024 "$SRC" --out "$ASSET/mac-icon-512@2x.png" >/dev/null
fi

if [ -d "$SAFARI_EXT" ]; then
  cp "$EXT/icons/icon128.png" "$SAFARI_EXT/icon.png"
fi

echo "icons synced (safari-safe, no blue tint)"
