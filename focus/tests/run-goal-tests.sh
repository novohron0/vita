#!/bin/sh
set -eu

ROOT="$(CDPATH= cd -- "$(dirname -- "$0")/../.." && pwd)"
BUILD_DIR="${TMPDIR:-/tmp}/vita-focus-goal-tests"
BINARY="$BUILD_DIR/FocusSharedGoalTests"

mkdir -p "$BUILD_DIR"
xcrun swiftc \
  -module-cache-path "$BUILD_DIR/module-cache" \
  "$ROOT/focus/safari/Vita Focus/Shared/FocusShared.swift" \
  "$ROOT/focus/tests/FocusSharedGoalTests.swift" \
  -o "$BINARY"
"$BINARY"
