#!/bin/sh
# Иконки Focus = apple-touch с vitadots.ru
set -e
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SRC="$ROOT/static/img/apple-touch.png"
EXT="$ROOT/focus/extension"
SAFARI_APP="$ROOT/focus/safari/Vita Focus/Shared (App)"
SAFARI_EXT="$ROOT/focus/safari/Vita Focus/Shared (Extension)/Resources"
ASSET="$SAFARI_APP/Assets.xcassets/AppIcon.appiconset"

[ -f "$SRC" ] || { echo "missing $SRC"; exit 1; }

for size in 48 96 128; do
  sips -z "$size" "$size" "$SRC" --out "$EXT/icons/icon${size}.png" >/dev/null
done
sips -z 56 56 "$SRC" --out "$EXT/popup/icon.png" >/dev/null
cp "$SRC" "$SAFARI_APP/Resources/Icon.png"

LARGE="$SAFARI_APP/Assets.xcassets/LargeIcon.imageset"
if [ -d "$LARGE" ]; then
  sips -z 128 128 "$SRC" --out "$LARGE/icon128.png" >/dev/null
  sips -z 256 256 "$SRC" --out "$LARGE/icon256.png" >/dev/null
  sips -z 384 384 "$SRC" --out "$LARGE/icon384.png" >/dev/null
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

echo "icons synced from vitadots.ru apple-touch"
