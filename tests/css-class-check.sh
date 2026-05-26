#!/usr/bin/env bash
# Checks that every static class name referenced in JS source files
# exists as a rule in app.css. Only parses literal class="..." strings;
# dynamic computed class names are not checked.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
CSS="$ROOT/public/assets/app.css"

MISSING=0

# Extract class token strings: class="foo bar" or class=${'foo bar'} (static literals)
# We look for: class="<words>" or class='<words>' patterns only.
classes=$(find "$ROOT/public/assets" -name "*.js" ! -path "*/vendor/*" \
  | xargs grep -hE ' class=["\$]["\{]?[a-zA-Z]' \
  | grep -oE 'class=["\x27]([a-zA-Z0-9_ -]+)["\x27]' \
  | sed "s/class=['\"]//;s/['\"]$//" \
  | tr ' ' '\n' \
  | sort -u)

while IFS= read -r cls; do
  [ -z "$cls" ] && continue
  if ! grep -q "\\.${cls}[^a-zA-Z0-9_-]" "$CSS"; then
    echo "MISSING: .${cls}"
    MISSING=$((MISSING + 1))
  fi
done <<< "$classes"

if [ "$MISSING" -eq 0 ]; then
  echo "PASS: all static class names found in app.css"
  exit 0
else
  echo "FAIL: $MISSING class(es) missing from app.css"
  exit 1
fi
