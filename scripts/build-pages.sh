#!/usr/bin/env bash
# Statická ukázka UI pro Cloudflare Pages (výstup: dist/). Plná aplikace (hlas, /api/*) vyžaduje lokální
# server (server/diktaty_server.py) a na Pages nefunguje; ukázka to hlásí bannerem v aplikaci.
set -euo pipefail
cd "$(dirname "$0")/.."
rm -rf dist
mkdir -p dist/data
cp -r web/. dist/
cp data/dictations.seed.json data/profiles.json dist/data/
cat > dist/_headers <<'HDR'
/*
  Content-Security-Policy: default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' data:; media-src 'self' blob:; connect-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'
  X-Content-Type-Options: nosniff
  Referrer-Policy: no-referrer
HDR
echo "dist/ připraven ($(find dist -type f | wc -l) souborů)"
