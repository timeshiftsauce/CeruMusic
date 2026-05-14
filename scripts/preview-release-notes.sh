#!/usr/bin/env bash
# Local helper to preview the release-notes section for a given tag.
# Usage: ./scripts/preview-release-notes.sh v1.14.0
set -e
TAG_NAME="${1:-$(git describe --tags --abbrev=0 2>/dev/null || echo v0.0.0)}"
CHANGELOG="${2:-CHANGELOG.md}"

if [ ! -f "$CHANGELOG" ]; then
  echo "❌ $CHANGELOG not found"
  exit 1
fi

awk -v tag="$TAG_NAME" '
  BEGIN { in_block = 0 }
  /^## \[/ {
    if (in_block) { exit }
    if (index($0, "[" tag "]") > 0) { in_block = 1; next }
  }
  in_block { print }
' "$CHANGELOG"
