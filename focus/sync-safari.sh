#!/bin/sh
# Синк extension → static registry → Xcode Safari project
set -e
FOCUS="$(cd "$(dirname "$0")" && pwd)"
REPO="$(cd "$FOCUS/.." && pwd)"

"$FOCUS/sync-registry.sh"
"$FOCUS/sync-icons.sh"

SAFARI_RES="$REPO/focus/safari/Vita Focus/Shared (Extension)/Resources"
if [ -d "$SAFARI_RES" ]; then
  rsync -a --delete \
    --exclude '.DS_Store' \
    "$REPO/focus/extension/" "$SAFARI_RES/"
  echo "safari extension synced"
else
  echo "skip safari (no Xcode project at focus/safari/)"
fi
