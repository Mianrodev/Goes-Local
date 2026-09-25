#!/usr/bin/env bash
# Release routine: check -> deploy orlando -> migrate+verify orlando -> deploy miami -> migrate+verify miami.
# Usage: scripts/deploy.sh [orlando|miami ...]   (default: orlando miami, in that order)
# Needs CLOUDFLARE_API_TOKEN and ADMIN_LOGIN_KEY in the environment. Stops at the first failure.
# ALLOW_CONFIG_CHANGE=1 deploys even when wrangler.toml deliberately differs from live settings.
set -euo pipefail
cd "$(dirname "$0")/.."

cities=("$@"); [ ${#cities[@]} -eq 0 ] && cities=(orlando miami)
: "${CLOUDFLARE_API_TOKEN:?CLOUDFLARE_API_TOKEN is not set}"
: "${ADMIN_LOGIN_KEY:?ADMIN_LOGIN_KEY is not set}"
export CLOUDFLARE_ACCOUNT_ID="${CLOUDFLARE_ACCOUNT_ID:-024a5f4e0646920e7c4557bda6ed2075}"

version=$(node scripts/precheck.mjs)
echo "worker.js is $version"
if [ -n "$(git status --porcelain -- worker.js wrangler.toml)" ]; then
  echo "✗ worker.js / wrangler.toml have uncommitted changes — commit first so git matches what's live."; exit 1
fi

if ! node scripts/check-live.mjs "${cities[@]}"; then
  if [ "${ALLOW_CONFIG_CHANGE:-}" = "1" ]; then
    echo "⚠ wrangler.toml differs from live (listed above) — deploying anyway because ALLOW_CONFIG_CHANGE=1"
  else
    echo "✗ wrangler.toml differs from live. If that's an intended settings change, rerun with ALLOW_CONFIG_CHANGE=1."; exit 1
  fi
fi

for city in "${cities[@]}"; do
  echo; echo "=== deploying $city ==="
  npx wrangler deploy --env "$city" --message "$version $(git rev-parse --short HEAD)"
  node scripts/migrate-verify.mjs "$city" "$version"
  echo "✓ $city is live on $version — now click through the change in a browser."
done
