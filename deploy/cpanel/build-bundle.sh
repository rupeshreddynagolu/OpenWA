#!/usr/bin/env bash
# Build a cPanel-ready OpenWA bundle: compiled API + dashboard, runtime-only package.json, Passenger startup file.
#
#   deploy/cpanel/build-bundle.sh [output-dir]      (default: release/openwa-cpanel, plus a .zip next to it)
#
# The bundle needs no TypeScript or dashboard toolchain on the server: upload the .zip, extract it as the
# application root, then let cPanel run npm install (see DEPLOY-CPANEL.md inside the bundle).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
OUT="${1:-$ROOT/release/openwa-cpanel}"
cd "$ROOT"

echo "==> Building the API and the dashboard"
npm run build:all

echo "==> Assembling $OUT"
rm -rf "$OUT"
mkdir -p "$OUT/scripts" "$OUT/dashboard"
cp -R dist "$OUT/dist"
cp -R dashboard/dist "$OUT/dashboard/dist"
# Source maps and type declarations are build artefacts the server never reads.
find "$OUT/dist" \( -name '*.map' -o -name '*.d.ts' \) -delete

cp package-lock.json LICENSE FORK-MARIADB.md "$OUT/"
# The postinstall hook and the dependency patches it applies to node_modules (Baileys + whatsapp-web.js fixes).
cp scripts/postinstall.js scripts/atomic-write.js scripts/*.patch "$OUT/scripts/"
for f in scripts/patch-*.js; do
  case "$f" in *.spec.js) ;; *) cp "$f" "$OUT/scripts/" ;; esac
done

cp deploy/cpanel/app.js "$OUT/app.js"
cp deploy/cpanel/puppeteerrc.cjs "$OUT/.puppeteerrc.cjs"
cp deploy/cpanel/env.example "$OUT/.env.example"
cp deploy/cpanel/README.md "$OUT/DEPLOY-CPANEL.md"
mkdir -p "$OUT/tools"
cp deploy/cpanel/copy-sqlite-to-mariadb.cjs "$OUT/tools/"

# Runtime-only package.json (see make-package-json.cjs: start script and a CloudLinux-tolerant postinstall).
node deploy/cpanel/make-package-json.cjs "$ROOT/package.json" > "$OUT/package.json"

echo "==> Zipping"
( cd "$(dirname "$OUT")" && rm -f "$(basename "$OUT").zip" && zip -qr "$(basename "$OUT").zip" "$(basename "$OUT")" )

echo "Done: $OUT"
echo "      $(dirname "$OUT")/$(basename "$OUT").zip ($(du -h "$(dirname "$OUT")/$(basename "$OUT").zip" | cut -f1))"
