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
- The sandbox egresses from Google Cloud (ASN 396982), which the WAF challenges. Our scripts send `x-gl-check: <sha256("gl-check:"+ADMIN_LOGIN_KEY)[:32]>`, which the WAF rules exempt (see `scripts/security-rules.mjs`). Plain `curl` without that header gets a 403 challenge — add the header.
- Token also has Zone WAF / Bot Management / Firewall Services Edit (added 25 Sep).

## Live settings worth knowing (read 2026-09-25)
- Orlando Variables: ADMIN_LOGIN_KEY (plain text — visible in the dashboard, unlike Miami's Secret), CITY_BRAND, CITY_COUNTY, CITY_DOMAIN, CITY_FROM_EMAIL, CITY_FROM_NAME, CITY_GA_IDS, CITY_NAME, CITY_STATE, CITY_TAGLINE. Secrets: GHL_API_TOKEN, GHL_LOCATION_ID.
  Missing vs Miami: GOOGLE_PLACES_API_KEY (no Google ratings refresh), GHL_PRIVATE_TOKEN_AGENT (agent logins), ADMIN_NOTIFY_EMAIL, PAYMENT_WEBHOOK_KEY, CITY_VALID_ZIPS. (STATUS_WEBHOOK_KEY added 29 Sep; the Orlando GHL workflow "Auto Listing Verification" posts to /webhooks/ghlstatus. Tested end to end with CFL Counseling.)
- Miami Variables: ADMIN_NOTIFY_EMAIL, CITY_GA_IDS (one ID only), GOOGLE_PLACES_API_KEY, PAYMENT_WEBHOOK_KEY, STATUS_WEBHOOK_KEY. Secrets: ADMIN_LOGIN_KEY, GHL_API_TOKEN, GHL_LOCATION_ID, GHL_PRIVATE_TOKEN_AGENT, GHL_PRIVATE_TOKEN_SALES. Miami sets no CITY_* except GA — it runs on the code defaults.
- Tampa (live 2 Oct 2026, worker `goes-local-tampa-api`): Variables CITY_NAME, CITY_BRAND, CITY_COUNTY, CITY_STATE, CITY_DOMAIN, CITY_FROM_EMAIL, CITY_FROM_NAME, CITY_TAGLINE, CITY_GA_IDS (G-PTHWYG1QQW, added 6 Oct); Secrets ADMIN_LOGIN_KEY, GHL_API_TOKEN, GHL_LOCATION_ID. STATUS_WEBHOOK_KEY added 6 Oct (Eric). GOOGLE_PLACES_API_KEY copied from Miami to Tampa and Orlando on 7 Oct (Google rating/review refresh for claimed listings). Still missing: PAYMENT_WEBHOOK_KEY and per-city Stripe payment links (Eric is setting up Stripe in each GHL account).

## First-time setup status (2026-09-25)
- [x] Live code pulled from both Workers — identical, committed and tagged `v15.79-shared`.
- [x] `wrangler.toml` written with the known D1 and KV ids; dry-run bundles both cities correctly.
- [x] `wrangler.toml` filled from the live Workers (compat dates, binding names, cron, custom domains, workers.dev on, logs on); `check-live` passes for both.
- [x] Orlando: no-change v15.79 deploy on 2026-09-25 15:34Z — settings identical before/after, migrate + /debug OK, browser click-through OK, full sync completed 15:45Z.
- [x] Miami: no-change v15.79 deploy on 2026-09-25 15:47Z — same checks passed; new sync pass started 15:50Z.

## Home-services sites (2026-10-06)
- `ny`, `il`, `ga` first deployed 6 Oct on this branch's v16.19 (renumbered v16.32 after merging main), Variables set (see `changelog/v16.34.md`), `ADMIN_LOGIN_KEY` secret set, migrated, `seed/home-services-categories.sql` loaded, `scripts/security-rules.mjs` applied to all three zones. Reachable at `homeservices-{ny,il,ga}-api.dev1-024.workers.dev`.
- **Custom domains not attached yet:** each zone has an old proxied A record on the apex (the site behind it returned 522) and the token can't edit DNS. Once Eric deletes those records, re-run `npx wrangler deploy --env <ny|il|ga>` (or PUT /workers/domains) to attach, then `npm run check-live -- ny il ga`. Plain-http requests were also being 302'd to `www.` by a rule the token can't read; check it after the domains attach.
- Still to add once GHL exists: `GHL_LOCATION_ID`, `GHL_API_TOKEN` (Secret), `CITY_FROM_EMAIL`, `CITY_FROM_NAME`, optionally `CITY_GA_IDS`, `ADMIN_NOTIFY_EMAIL`, `GOOGLE_PLACES_API_KEY`, `STATUS_WEBHOOK_KEY`.
- 6 Oct (later): `ny`, `il`, `ga` deployed on v16.32-shared (main merged in), migrated, Miami starter hero slides / content images cleared and re-seeded without photos. Then (7 Oct, Eric's OK): `CITY_FREE_ONLY` removed on all three, so Pricing shows; v16.33 deployed. `CITY_LICENSE` not set (Eric: not needed); the About page gives generic license advice instead. Checkout stays off until each site has `PAYMENT_WEBHOOK_KEY`.
- 7 Oct: GHL secrets present on all three. First `/admin/sync`: **NY** "GHL 403: The token does not have access to this location" (token and GHL_LOCATION_ID RLxBG8BwCpBiNcLbHVFE don't match); **IL/GA** connect but "no contacts tagged 'business'". v16.35 deployed. IL/GA photos imported (see changelog/v16.35.md); NY photos wait on its token. Custom domains still blocked by the old apex A records (error 100117; token has no DNS edit). Also missing on all three: CITY_FROM_EMAIL / CITY_FROM_NAME (emails would otherwise go out from Miami's default sender), CITY_GA_IDS, payment links, STATUS_WEBHOOK_KEY.
- 7 Oct (later): NY's new token had been saved into GHL_LOCATION_ID; moved it to GHL_API_TOKEN and set GHL_LOCATION_ID back to RLxBG8BwCpBiNcLbHVFE (token checked: reads 3,244 contacts). Namecheap parking records (apex A + www CNAME) deleted on all three zones (token now has DNS edit); apex and www custom domains attached (www 301s to the apex via the v16.31 code). `check-live ny il ga` passes. CITY_FROM_EMAIL `noreply@lc.homeservicesin{ny,il,ga}.com` and CITY_FROM_NAME set (GHL sending subdomain `lc.` is in DNS). NY photos imported and wired like IL/GA. **Blocking listings:** every contact in all three accounts (NY 3,244 · IL 2,652 · GA 2,428) is tagged only `untouched`; the sync needs the `business` tag.
- 7 Oct (evening): all three live with listings (NY 3,244 · IL 2,652 · GA 2,424), v16.38. Live click-through (home, categories, search, a city page, pricing, blog, admin login) passed on all three domains with no JS errors or 5xx. Open (optional): city photos for the biggest towns, appliance-repair / water-treatment / new category photos, GA IDs, payment links, STATUS_WEBHOOK_KEY, GOOGLE_PLACES_API_KEY, logo upload; non-home-service contacts (drug stores etc.) are filed under Other — Eric may want them untagged in GHL.
