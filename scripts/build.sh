#!/usr/bin/env bash
# Package the plugin as an installable .xpi (a plain zip with a different extension).
set -euo pipefail

cd "$(dirname "$0")/.."

VERSION=$(node -p "require('./manifest.json').version")
OUT_DIR="build"
XPI="$OUT_DIR/zotpdf-$VERSION.xpi"

rm -rf "$OUT_DIR"
mkdir -p "$OUT_DIR"

zip -r -q -X "$XPI" \
	manifest.json \
	bootstrap.js \
	prefs.js \
	preferences.xhtml \
	preferences.js \
	preferences-fullvahti.xhtml \
	preferences-fullvahti.js \
	src \
	locale \
	icons \
	LICENSE \
	LICENSE-FULLVAHTI \
	LICENSE-LUCIDE \
	NOTICE \
	--exclude '*.DS_Store'

cp "$XPI" "$OUT_DIR/zotpdf.xpi"

echo "$XPI"
