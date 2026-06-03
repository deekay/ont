#!/usr/bin/env bash
# Render the ONT one-pager HTML to a two-page PDF using headless Chrome.
# Usage: ./render.sh   (override the browser with CHROME=/path/to/chrome)
set -euo pipefail
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CHROME="${CHROME:-/Applications/Google Chrome.app/Contents/MacOS/Google Chrome}"
"$CHROME" --headless --disable-gpu --no-pdf-header-footer \
  --print-to-pdf="$DIR/ONT_one-pager.pdf" "file://$DIR/onepager.html"
echo "wrote $DIR/ONT_one-pager.pdf"
