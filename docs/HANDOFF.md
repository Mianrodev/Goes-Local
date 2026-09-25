# Goes Local — Handoff to Claude Code

**Date:** 24 Sep 2026
**From:** Cowork session (Claude) → **To:** Claude Code
**Owner:** Eric Vance (dev1@mianrosystems.com), Mianro Systems
**Live version on both cities at handoff:** `v15.79-shared`
**The code:** one file, `worker.js` (~853 KB, ~10,600 lines). Git tag `v15.79-shared` is the live copy pulled from both Workers on 25 Sep 2026 (they were identical).

> **Status updates since the handoff** are tracked in `docs/DEPLOY.md` (deploy setup) and `changelog/`.

---

## 0. The five rules that matter most

1. **Nothing is "done" until it's confirmed live in a real browser.** Not `node --check`, not a test suite, not "the code looks right" — Eric has been burned repeatedly by code paths that report success and do nothing. Click through the real site.
2. **Deploy with Wrangler — Eric no longer copy-pastes.** A careless first deploy can wipe the live site's database connection, settings or 5-minute sync, so follow §7 exactly and prove it with an unchanged v15.79 before shipping anything new. After every deploy, check `/debug` (`VERSION:` line) on both cities.
3. **After any deploy that adds a table or column, run the migration on each city.** Deploys do *not* run migrations automatically — the v15.79 test failed on its very first save for exactly this reason. `scripts/deploy.sh` does it.
4. **One shared code file runs every city.** Miami and Orlando are the same bytes, deployed twice with different Cloudflare Variables. Never hardcode anything city-specific (names, prices, GA IDs, schema JSON, image URLs) into the file — it goes into that city's D1 or into a `CITY_*` variable. Miami leaked its GA IDs into Orlando this way once (fixed v15.77).
5. **Plain English with Eric, technical depth in documents.** He communicates in short direct messages, doesn't want jargon in chat, and wants UI changes mocked up before they're built. Put the technical detail in the changelog, not the chat.

---

## 1. What this is

A multi-city local business directory network under the "Goes Local" brand. Long-term target 100+ cities. Two are live:

| City | Domain | Cloudflare Worker | D1 database | KV namespace | GHL location |
|---|---|---|---|---|---|
| Miami | miamigoeslocal.com | `goes-local-miami-api` | `miami-directory-db` (`b0226c38-0b16-45d9-84bf-603435efa245`) | `GOES_LOCAL_SESSIONS` (`4355959c05424505953f2ccf725eee4c`) | `0a5ao5C3pqUq6QXdQHxe` |
| Orlando | orlandogoeslocal.com | `goes-local-orlando-api` | `orlando-directory-db` (`25894099-96cd-4431-8930-f21badead15b`) | `GOES_LOCAL_ORLANDO_SESSIONS` (`99679f634f624df0b542c1e2b21a2480`) | `WBkYBSVDnGUN7JKzWYtd` |

Cloudflare account `024a5f4e0646920e7c4557bda6ed2075`. The account also has `pulse-db` and `miami-directory` (12 KB, looks like an empty leftover) D1 databases that this project does not use. Tampa is next in line; the older `v14.27-tampa` build predates the shared-code approach — **ignore it**, a Tampa launch is a new deployment of the shared file (§8).

Miami: ~16,800 listings, 132 categories, 27 neighbourhoods. Orlando: ~14,500 listings, 8 categories, 37 neighbourhoods.

**People:** Eric = product owner and sole decision-maker. Eric's boss = design/UX feedback, owns the Google Cloud account. An SEO team sends briefs and structured-data snippets (admin-panel access, no code access). A colleague (eric.v@mianrosystems.com) tests. "Agents" = staff role with admin-panel access.

---

## 2. Architecture in one screen

```
Browser ──► Cloudflare Worker (worker.js, one file, server-rendered HTML)
                │
                ├── D1 (SQLite)  — per city: listings, posts, news, SEO, images, claims, everything
                ├── KV           — sessions, rate limits, sync lock
                ├── GoHighLevel  — per city sub-account: CRM + source of truth for listings,
                │                  outgoing email/SMS, payments (FastPayDirect)
                ├── Google Places API (New) — ratings/reviews backfill (shared key)
                └── Stripe       — shared account (webhook handler exists; GHL still does most payment flow)

Cron (every 5 min) ──► same Worker `scheduled()` : listing sync from GHL, bulk import batches,
                                                   Google reviews batch, Listing-URL write-back to GHL
```

- **Everything is in `worker.js`.** Public pages, owner dashboard (`/account`, `/manage`), admin panel (`/admin/*`), auth, cron, migrations, email templates, CSS. No build step, no framework. Template literals return HTML strings.
- **No comments in shipped code** — Eric's preference to keep the file small. (v15.77+ added a handful around city config; tolerated, don't add more.)
- **GHL's page builder is never used.** All SEO/pages/admin tooling is in this Worker. "The SEO thing in GHL" means the site's own `/admin` panel.
- **D1 binding is discovered, not named**: `getDB(env)` returns the first env binding with a `.prepare` function. KV likewise (`KVOF`). So binding names don't matter to the code, but there must be exactly one D1 bound.

### City configuration
Top of file: `const S = { city, st, county, brand, tagline, dom, tag, ttl: 900, gaIds: [] }` plus `AUTH = { SITE_URL, FROM_EMAIL, FROM_NAME, … }` and `FLAGS`. Defaults are Miami's values **except GA IDs, which default to empty**. At the bottom (`export default`), `env.CITY_*` variables override these before every request/cron:

| Variable | Overrides | Notes |
|---|---|---|
| `CITY_NAME` | `S.city` | Also gates Miami-only seed data: `!env.CITY_NAME \|\| env.CITY_NAME==="Miami"` |
| `CITY_STATE`, `CITY_COUNTY`, `CITY_BRAND`, `CITY_TAGLINE` | `S.*` | |
| `CITY_DOMAIN` | `S.dom` **and** `AUTH.SITE_URL` | With `https://` |
| `CITY_GA_IDS` | `S.gaIds` | Comma-separated. Miami = `G-6Q9XD0PSXP,G-4GYL8HMEGL`, Orlando = `G-8ECDB32Y3W`. **Unset = no analytics** (deliberate, v15.77). |
| `CITY_FROM_EMAIL`, `CITY_FROM_NAME` | `AUTH.*` | Sending domain must be verified in that city's GHL or every email bounces |
| `CITY_VALID_ZIPS` | zip allow-list | Miami's list is hardcoded in `CITY_VALID_ZIPS.Miami`; other cities supply theirs |

Other env vars: `GHL_LOCATION_ID`, `GHL_API_TOKEN`, `GHL_PRIVATE_TOKEN_AGENT`, `ADMIN_LOGIN_KEY` (same key across all cities — deliberate), `ADMIN_NOTIFY_EMAIL` (fallback only; real recipients in `/admin/emailtemplates`), `GOOGLE_PLACES_API_KEY`, `PAYMENT_WEBHOOK_KEY` (**must be Text type, not Secret** — Secret failed to persist), `STATUS_WEBHOOK_KEY`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_ID`, `RESEND_API_KEY`.

### D1 tables (all created by `migrate()`)
`businesses` (listings; `ghl_id` unique; FTS5 shadow `biz_fts`), `meta`, `claims`, `posts`, `news`, `reviews`, `follows`, `photos`, `comments`, `updates`, `events`, `review_requests`, `import_batches`/`import_rows`, `cancellations`, `deletion_requests`, `slug_redirects`, `ad_requests`, `ad_slots`/`ad_slot_queue`, `category_banners`/`category_banner_images`, `category_faqs`, `hoods`/`hood_zips`/`hood_pending`/`hood_faqs`, `hero_slides`, `content_images`, `email_templates`, `site_seo`, `pending_email_invites`, `page_schema` (**unused leftover** — safe to drop from `migrate()`).

`migrate(DB, env)` is a sequence of `CREATE TABLE IF NOT EXISTS` + `ALTER TABLE ADD COLUMN` each in its own `try{}catch{}` — idempotent. It runs **only** on `/admin/migrate`, `/admin/sync`, `/admin/urlsync` — not on deploy, requests or cron. Pattern:

```js
try { await DB.prepare("ALTER TABLE site_seo ADD COLUMN custom_schema TEXT DEFAULT ''").run(); } catch {}
```

### Caching
- Homepage and most public pages: edge-cached up to 5 min. `/debug` and anything `cache-control: no-store` is instant — **use `/debug` to confirm a deploy**, never the homepage.
- In-isolate caches keyed on `S.ttl` (900 s): `C` (listings shell), `SEOC` (site_seo), content images. A DB change can take up to 15 min to show; not a bug.

---

## 3. Route map

**Public:** `/`, `/search`, `/categories`, `/{category-slug}`, `/{category-slug}/{business-slug}`, `/neighbourhoods`, `/neighbourhood/{slug}`, `/blog`, `/blog/{slug}`, `/news`, `/news/{slug}`, `/about`, `/pricing`, `/add`, `/claim`, `/claimed`, `/featured`, `/advertise`, `/privacy`, `/terms`, `/sitemap*.xml`, `/robots.txt`.

**Owner auth/dashboard:** `/login`, `/signup`, `/verify`, `/code`, `/auth`, `/forgot`, `/reset`, `/logout`, `/account`, `/manage`.

**Admin panel** (`/admin/*`, cookie session, roles `admin` | `agent`; `agent` can't run migrate/sync/import):

| Dropdown | Pages |
|---|---|
| Listings | pending, claims, cancellations, deletions, adrequests, businesses |
| Content | comments, hero, images, banner-images, hoods, ads, banners, claiminvites |
| **SEO** (v15.79) | seo, blog, news, faqs, hoodfaqs |
| Admin (admin only) | status, import, sync, urlsync, emailtemplates, migrate, debug |

Not in the nav: `/admin/login`, `/admin/logout`, `/admin/whoami?email=`, `/admin/fields` (dumps raw GHL custom fields — use first when "field not found"), `/admin/emailtest` & `/admin/testmail`, `/admin/googlereviews`, `/admin/insertone?id={ghl_contact_id}`, `/admin/start`.

`ADMINNAV(path, role)` builds the nav from `listingItems` / `contentItems` / `seoItems` / `adminOnlyItems` via `drop(label, items)`. Add a page = add a `[path, label]` pair + handle `p[1] === "yourpage"` in the admin router.

**Webhooks:** payment (GHL → Worker, keyed by `PAYMENT_WEBHOOK_KEY`, expects `biz` param), Stripe, status.

**`/debug`** (admin): `VERSION`, GHL token/location, D1/KV found, `FLAGS`, GA IDs, listing/category counts, last sync, first row.

---

## 4. The SEO system (v15.78 / v15.79)

Per-city JSON-LD for fixed pages lives in D1, not code.

- **Data:** `site_seo(page_key PK, title, desc, custom_schema, updated_at)`. Loaded by `seoOverrides(DB)` into `SEOC`.
- `SEO_PAGES` (`home, categories, add, about, pricing, neighbourhoods, news, blog`), `SEO_FALLBACK()`, `SEOTXT(key, …)`, `SEOLD(key)` → `customSchemaLd(raw)` (also used by `posts.custom_schema` / `news.custom_schema`).
- Page builders pass `ld:` into `PAGE(d, o)`; one object or an array, each becomes a `<script type="application/ld+json">`.
- Admin: `ADMINSEO`, `GET /admin/seo`, `POST /admin/seo/save` (JSON validated, upsert), `GET /admin/seo/reset?page=`.
- v15.78 removed the 5,000-char cap on the blog/news schema box.
- Tested live on Miami 22–24 Sep. Both cities migrated. Nothing pending — SEO team uses **Admin → SEO → SEO**. Miami's Homepage row has a custom meta description from the team — leave it alone.

---

## 5. Open work, in priority order

### 5a. D1 write cost — sync writes every listing every 5 minutes (approved)
$26 in one cycle, 100% D1 Rows Written (75.8M; 50M free). The cron sync does a full `INSERT … ON CONFLICT(ghl_id) DO UPDATE` for every business every pass. Two near-identical copies: the bulk loop in `syncStep()` and the single-record helper behind `/admin/insertone`.
**Fix:** fingerprint the fields (cheap hash), store in a new `sync_hash TEXT` column, skip unchanged. Precedent: Listing-URL sync only writes rows whose `url_synced_path` changed. Done = steady-state pass writes ~0 rows. Needs migrate.

### 5b. Intermittent 500 on `/blog` index (approved)
~1 in 6 requests failed. Likely why Search Console reported "could not fetch". Hypothesis: D1 contention during sync bursts. **First step:** Observability → Events on the Miami Worker → path `/blog` → read the exception. Don't guess. Re-test with 10–20 rapid hits after 5a; tell the SEO team to re-request a fetch.

### 5c. Code drift between canonical and live Orlando — **resolved 25 Sep 2026**: both live Workers byte-identical.

### 5d. Tampa launch (infrastructure) — see §8.

### 5e. Roadmap (scoped, not scheduled)
Structured hours + "Currently Open" badge (needs a "Structured Hours" GHL text field); named photo slots (partially exists as `slots` JSON column); ownership badges; consumer accounts; Follow Business notifications; private SEO keyword landing pages; blog-as-a-service; internal admin hierarchy; annual plan; Google API refresh for paid/claimed; GHL-style analytics dashboard (deferred).

### 5f. Housekeeping
- Drop the unused `page_schema` CREATE from `migrate()`.
- Audit "success message" code paths for silent failures (§6).
- GHL: payment workflow should pass the `biz` URL parameter.
- A pending listing with explicit content ("Escort"/Chery) flagged 17 Sep — check it's gone.
- Miami-hosted fallback images (`HERO_IMG`, `CAT_IMG` ~line 524) are hardcoded in the shared file; they're only defaults when a city's `content_images` is empty, but they are Miami assets.

---

## 6. Hard-won gotchas

**GoHighLevel**
- Contact-update API **silently drops custom-field changes when bundled with native fields** in the same PUT, returns 200. Always two separate calls.
- Eventual consistency: a re-sync can overwrite D1 with stale GHL data right after a write. Don't remove the KV sync lock.
- Conversations view is useless for verifying email; use `/admin/emailtest`.
- Custom-field search sometimes returns nothing for fields that exist; check a contact detail page.
- Phone-number dedupe reuses existing contacts; since v15.76 the form writes Business Name/address onto it.

**Silent success**
- Past bugs: GHL email 200 with no send; forms showing "thanks" while the write failed; background sync reverting edits; the Tier A/B auto-verify fast path that created a duplicate listing. Any claim fast-path must route through `/admin/pending`.
- Automated form submits sometimes silently fail. `fetch()` from devtools bypasses the real form flow. When in doubt, ask Eric to click it by hand.

**Cloudflare**
- `/admin/migrate` after every schema change. Safe to repeat.
- Observability → Events shows exact exception text including D1 SQL errors.
- The in-browser D1 console silently blocks some writes. Use the D1 API / MCP `d1_database_query`.
- `PAYMENT_WEBHOOK_KEY` must be a Text variable, not Secret.

**Images / multi-city data**
- Category tiles come from `content_images` in **that city's** D1. New cities start blank. Copy Miami's rows and **verify the `image_url` values landed** (a prior copy left them empty). Skip `brand_logo`, `mega_promo`, `owner_cta`.
- `hero_slides` likewise per-city; the 10 current photos are clean (no baked-in text). Always open an image and check for baked-in text before reusing.

**Browser automation**
- Confirm tab IDs before navigating. GHL iframes block DOM tools. `/admin/seo/reset` can make a tab report "frozen" ~30 s though the request succeeded — re-navigate, don't retry.

---

## 7. Deploying — see `docs/DEPLOY.md`

Release routine:
1. Edit `worker.js` (one file for every city).
2. `npm run precheck`; bump `const BUILD = "v15.xx-shared"`.
3. Commit; add `changelog/v15.xx.md`.
4. `scripts/deploy.sh` → Orlando deploy → migrate → `/debug` check → Miami, same. Click through the changed feature live.
5. Tell Eric in plain English what changed and that it's live. Tag `v15.xx-shared`.
6. UI changes: mockup and a yes **before** building.
7. Rollback: `npx wrangler rollback --env <city>` or redeploy the previous tag.

History: v15.76 CRM Business Name on existing contacts → v15.77 GA IDs to `CITY_GA_IDS` → v15.78 schema box limit removed → v15.79 SEO nav tab + per-page JSON-LD.

## 8. Launching the next city (Tampa)

1. GHL: clone a sub-account from the Miami snapshot; verify the sending domain.
2. Buy domain, add to Cloudflare.
3. Create a D1 and KV namespace, add `[env.tampa]` to wrangler.toml, `npx wrangler deploy --env tampa`.
4. Set Variables: all `CITY_*`, plus `GHL_LOCATION_ID`, `GHL_API_TOKEN`, `GHL_PRIVATE_TOKEN_AGENT`, `ADMIN_LOGIN_KEY`, `ADMIN_NOTIFY_EMAIL`, `PAYMENT_WEBHOOK_KEY`, `GOOGLE_PLACES_API_KEY`, `CITY_VALID_ZIPS`.
5. `/admin/migrate`, then `/debug` to confirm bindings.
6. Copy Miami's `content_images` rows and verify URLs; copy the 10 `hero_slides` URLs matched to Tampa titles and enable them.
7. Neighbourhoods via `/admin/hoods` (Downtown, Ybor City, Hyde Park, South Tampa, Seminole Heights, Carrollwood, New Tampa, Brandon).
8. Point the domain, `/admin/sync`, check `/categories` and homepage visually.
8b. **Bot protection (required):** `node scripts/security-rules.mjs <newcity>goeslocal.com` — adds the scraper block, cloud-network challenge, filter-crawl challenge and rate limit, with webhooks/admin exempt. Do **not** turn on Bot Fight Mode (free plan can't exempt webhooks).
9. **Payment links decision first:** the four FastPayDirect links (`FEATURED_PAY_URL`, `FEATURED_PAY_URL_ANNUAL`, `PREMIUM_PAY_URL`, `PREMIUM_PAY_URL_ANNUAL`, ~line 3493) are hardcoded and shared — Orlando currently sends upgrades through Miami's links, and Orlando has no `PAYMENT_WEBHOOK_KEY`. Either intended (one merchant) or they become `CITY_PAY_*` variables. Ask Eric.

Decision on record: once a new city is proven on the shared setup, Miami stays on it too — no separate Miami branch.

## Duplicate listings (since v15.91)
Listings with the same name + phone + address show once on the site: the kept copy is chosen claimed → Plus → paid → most reviews. The other copies are hidden (table `dup_hidden`), and their old URLs 301 to the kept one. This runs after every sync pass. You can also run it now at `/admin/duplicates`. `/admin/duplicates?csv=1` downloads the list so the CRM team can merge or delete copies in GoHighLevel. Claimed or paid copies are never hidden. First run on 25 Sep: Orlando hid 837 copies, Miami 3,003.
