# Deploying Goes Local

## What it needs
Two environment variables in the Claude Code cloud environment (never in the repo):

| Variable | What | Where it comes from |
|---|---|---|
| `CLOUDFLARE_API_TOKEN` | Lets Wrangler deploy and read Worker settings | Cloudflare dash → My Profile → API Tokens → "Edit Cloudflare Workers" template, plus **D1: Edit** and **Zone: Workers Routes: Read**, scoped to account `024a5f4e0646920e7c4557bda6ed2075` and the two zones |
| `ADMIN_LOGIN_KEY` | Signs in to `/admin` to run the migration and read `/debug` | Same value as the Workers' `ADMIN_LOGIN_KEY` variable |

The environment's network access must also allow `api.cloudflare.com`, `miamigoeslocal.com`, `orlandogoeslocal.com` (and `sparrow.cloudflare.com` if you want Wrangler telemetry — not required).

## Commands
```
npm ci
npm run precheck           # syntax, duplicate routes, VERSION, leaked city values
npm run check-live         # wrangler.toml vs the live Workers: bindings, cron, domains, flags
scripts/deploy.sh          # precheck → check-live → orlando deploy+migrate+verify → miami deploy+migrate+verify
scripts/deploy.sh orlando  # one city only
npx wrangler rollback --env orlando   # undo the last deploy on one city
```
`deploy.sh` refuses to run with uncommitted changes to `worker.js` or `wrangler.toml`, and stops at the first failure.

## How the config stays safe
- `keep_vars = true` — dashboard Variables (CITY_*, GHL tokens, keys) are left alone. Secrets are never touched by a deploy.
- `no_bundle = true` — `worker.js` is uploaded byte-for-byte as committed, so live code can be compared with git.
- `check-live` compares the live Worker's D1/KV bindings, compatibility date and flags, observability, cron, custom domains, zone routes and workers.dev settings with `wrangler.toml`, and fails on any difference. It also lists the live Variable and Secret names.

## First-time setup status (2026-09-25)
- [x] Live code pulled from both Workers — identical, committed and tagged `v15.79-shared`.
- [x] `wrangler.toml` written with the known D1 and KV ids; dry-run bundles both cities correctly.
- [ ] Fill the `CHECK_LIVE` values (compatibility date, binding names, cron, domains, workers.dev) from `npm run check-live`. Needs the API token.
- [ ] No-change deploy of v15.79 to Orlando, verify, then Miami.
