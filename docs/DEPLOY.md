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
npm run browse-check -- orlando       # real headless-Chromium click-through + screenshots
```
`deploy.sh` refuses to run with uncommitted changes to `worker.js` or `wrangler.toml`, and stops at the first failure.

## How the config stays safe
- `keep_vars = true` — dashboard Variables (CITY_*, GHL tokens, keys) are left alone. Secrets are never touched by a deploy.
- `no_bundle = true` — `worker.js` is uploaded byte-for-byte as committed, so live code can be compared with git.
- `check-live` compares the live Worker's D1/KV bindings, compatibility date and flags, observability, cron, custom domains, zone routes and workers.dev settings with `wrangler.toml`, and fails on any difference. It also lists the live Variable and Secret names.

## Sandbox notes (Claude Code cloud)
- The token must have **no Client IP filtering** — the sandbox's outgoing IP changes.
- Token permissions in use: Account D1 Edit, Workers Scripts Edit, Workers KV Storage Edit, Account Settings Read, Workers Tail Read; Zone Read; User Details Read, Memberships Read. Not granted: Workers Observability (logs query API) — ask for it when investigating errors.
- `wrangler tail` doesn't connect from the sandbox (long-lived websocket through the proxy). To confirm cron still runs after a deploy, watch the `sync:progress` key in the city's SESSIONS KV namespace change.
- Headless Chromium must trust the egress proxy CA; `scripts/browse-check.mjs` passes its SPKI pin.

## Live settings worth knowing (read 2026-09-25)
- Orlando Variables: ADMIN_LOGIN_KEY (plain text — visible in the dashboard, unlike Miami's Secret), CITY_BRAND, CITY_COUNTY, CITY_DOMAIN, CITY_FROM_EMAIL, CITY_FROM_NAME, CITY_GA_IDS, CITY_NAME, CITY_STATE, CITY_TAGLINE. Secrets: GHL_API_TOKEN, GHL_LOCATION_ID.
  Missing vs Miami: GOOGLE_PLACES_API_KEY (no Google ratings refresh), GHL_PRIVATE_TOKEN_AGENT (agent logins), ADMIN_NOTIFY_EMAIL, PAYMENT_WEBHOOK_KEY, STATUS_WEBHOOK_KEY, CITY_VALID_ZIPS.
- Miami Variables: ADMIN_NOTIFY_EMAIL, CITY_GA_IDS (one ID only), GOOGLE_PLACES_API_KEY, PAYMENT_WEBHOOK_KEY, STATUS_WEBHOOK_KEY. Secrets: ADMIN_LOGIN_KEY, GHL_API_TOKEN, GHL_LOCATION_ID, GHL_PRIVATE_TOKEN_AGENT, GHL_PRIVATE_TOKEN_SALES. Miami sets no CITY_* except GA — it runs on the code defaults.
- The account also holds the zone `tampagoeslocal.com` (not yet attached to a Worker).

## First-time setup status (2026-09-25)
- [x] Live code pulled from both Workers — identical, committed and tagged `v15.79-shared`.
- [x] `wrangler.toml` written with the known D1 and KV ids; dry-run bundles both cities correctly.
- [x] `wrangler.toml` filled from the live Workers (compat dates, binding names, cron, custom domains, workers.dev on, logs on); `check-live` passes for both.
- [x] Orlando: no-change v15.79 deploy on 2026-09-25 15:34Z — settings identical before/after, migrate + /debug OK, browser click-through OK, full sync completed 15:45Z.
- [x] Miami: no-change v15.79 deploy on 2026-09-25 15:47Z — same checks passed; new sync pass started 15:50Z.
