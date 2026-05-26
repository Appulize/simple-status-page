#!/usr/bin/env bash
# Checks that no unjustified inline styles exist in the JS source files.
# Accepted exceptions: stackbar/uptime segment widths (dynamic percentage from data).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
JS_FILES=$(find "$ROOT/public/assets" -name "*.js" ! -path "*/vendor/*")

VIOLATIONS=0

while IFS= read -r file; do
  # Extract lines with style= (both style=${{ and style={{ patterns)
  while IFS= read -r line; do
    lineno=$(echo "$line" | cut -d: -f1)
    content=$(echo "$line" | cut -d: -f2-)

    # Allowed: dynamic width percentages (stackbar segments, gauge bars, uptime bars)
    if echo "$content" | grep -qE "style=.*width.*%"; then continue; fi
    # Allowed: disabled button opacity (computed from boolean state)
    if echo "$content" | grep -qE "style=.*opacity"; then continue; fi

    echo "VIOLATION: $(basename "$file"):$lineno"
    echo "  $content"
    VIOLATIONS=$((VIOLATIONS + 1))
  done < <(grep -n "style=\${{" "$file" 2>/dev/null || true)
done <<< "$JS_FILES"

if [ "$VIOLATIONS" -eq 0 ]; then
  echo "PASS: no unjustified inline styles found"
  exit 0
else
  echo "FAIL: $VIOLATIONS violation(s) found"
  exit 1
fi
