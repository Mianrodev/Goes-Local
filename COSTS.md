# Goes Local — Cloudflare cost log

Goal: whole account ≈ the $5 Workers Paid plan, with room for 5 cities. Allowances are **per account** (all databases/Workers share them): 25B D1 rows read/month, 50M rows written/month, 30M Worker CPU-ms/month. Budget per city ≈ **< 100M rows read/day** (ceiling 150M).

How numbers are measured: Cloudflare GraphQL `d1AnalyticsAdaptiveGroups` (daily/hourly rows read/written per database) and `d1QueriesAdaptiveGroups` (per-query rows read, last 24 h). Miami D1 = `b0226c38…`, Orlando D1 = `25894099…`.

## Baseline — 25 Sep 2026 ~19:00 UTC (live code v15.83)

Already live before this work: Smart Placement (v15.80 era), robots.txt blocking `?rating=/?claim=/?sort=` (v15.81), slim blog/news list queries (v15.81).

| Day | Miami rows read | Orlando rows read | Miami written | Orlando written |
|---|---|---|---|---|
| 21 Sep | 3,710M | 822M | 86k | 43k |
| 22 Sep | 4,036M | 1,137M | 47k | 43k |
| 23 Sep | 2,963M | 930M | 72k | 36k |
| 24 Sep | 2,774M | 1,055M | 48k | 37k |
| 25 Sep (to 19:00) | 2,313M | 945M | 49k | 20k |

Hourly on 25 Sep: Miami 81–145M/h, Orlando 32–63M/h (≈ 2.8B + 1.1B/day ⇒ ~117B/month ⇒ ~$92/month over the allowance).

Note: a separate database `lead-scraper-db` (not Goes Local) was created on 25 Sep and wrote 108k rows that day — it shares the same account allowance.

### Top queries by rows read, last 24 h

**Miami**

| Runs | Rows read | Query |
|---|---|---|
| 14245 | 479M | `SELECT cs slug,cat name,COUNT(*) n FROM businesses GROUP BY cs,cat ORDER BY n DESC` |
| 115448 | 325M | `SELECT sub,COUNT(*) n FROM businesses WHERE cs=?1 AND hood=?2 AND claimed=?3 AND sub<>'' GROUP BY sub` |
| 103134 | 297M | `SELECT sub,COUNT(*) n FROM businesses WHERE cs=?1 AND hood=?2 AND sub<>'' GROUP BY sub` |
| 93435 | 289M | `SELECT sub,COUNT(*) n FROM businesses WHERE cs=?1 AND hood=?2 AND rat>=?3 AND claimed=?4 AND sub<>'' GROUP BY sub` |
| 13671 | 267M | `SELECT cs,sub,COUNT(*) n FROM businesses WHERE sub<>'' GROUP BY cs,sub ORDER BY n DESC` |
| 93759 | 264M | `SELECT sub,COUNT(*) n FROM businesses WHERE cs=?1 AND hood=?2 AND rat>=?3 AND sub<>'' GROUP BY sub` |
| 14287 | 239M | `SELECT COUNT(*) n FROM businesses` |
| 70953 | 181M | `SELECT * FROM businesses WHERE cs=? AND sub=? AND ghl_id NOT IN (?,?,?,?) ORDER BY premium DESC, claimed DESC, rat DESC,` |
| 123950 | 80M | `SELECT COUNT(*) n FROM businesses WHERE cs=?1 AND hood=?2 AND claimed=?3` |
| 92076 | 64M | `SELECT COUNT(*) n FROM businesses WHERE cs=?1 AND hood=?2 AND rat>=?3 AND claimed=?4` |
| 99995 | 64M | `SELECT COUNT(*) n FROM businesses WHERE cs=?1 AND hood=?2 AND rat>=?3` |
| 103834 | 60M | `SELECT COUNT(*) n FROM businesses WHERE cs=?1 AND hood=?2` |
| 6794 | 40M | `SELECT * FROM businesses WHERE cs=?1 AND slug<>?2 ORDER BY plus DESC, premium DESC, rat DESC LIMIT ?` |
| 10608 | 34M | `SELECT COUNT(*) n FROM businesses WHERE cs=?1 AND rat>=?2` |
| 9715 | 28M | `SELECT sub,COUNT(*) n FROM businesses WHERE cs=?1 AND rat>=?2 AND claimed=?3 AND sub<>'' GROUP BY sub` |

**Orlando**

| Runs | Rows read | Query |
|---|---|---|
| 8789 | 254M | `SELECT cs slug,cat name,COUNT(*) n FROM businesses GROUP BY cs,cat ORDER BY n DESC` |
| 99412 | 224M | `SELECT * FROM businesses WHERE cs=? AND sub=? ORDER BY premium DESC, claimed DESC, rat DESC, rev DESC LIMIT ?` |
| 8524 | 130M | `SELECT cs,sub,COUNT(*) n FROM businesses WHERE sub<>'' GROUP BY cs,sub ORDER BY n DESC` |
| 7581 | 109M | `SELECT COUNT(*) n FROM businesses` |
| 35248 | 78M | `SELECT sub,COUNT(*) n FROM businesses WHERE cs=?1 AND hood=?2 AND rat>=?3 AND sub<>'' GROUP BY sub` |
| 29645 | 66M | `SELECT sub,COUNT(*) n FROM businesses WHERE cs=?1 AND hood=?2 AND sub<>'' GROUP BY sub` |
| 26168 | 57M | `SELECT sub,COUNT(*) n FROM businesses WHERE cs=?1 AND hood=?2 AND claimed=?3 AND sub<>'' GROUP BY sub` |
| 1721 | 23M | `SELECT * FROM businesses WHERE name LIKE ?1 ORDER BY plus DESC, premium DESC, rat DESC LIMIT ?` |
| 4167 | 20M | `SELECT * FROM businesses WHERE cs=?1 AND slug<>?2 ORDER BY plus DESC, premium DESC, rat DESC LIMIT ?` |
| 32382 | 15M | `SELECT COUNT(*) n FROM businesses WHERE cs=?1 AND hood=?2 AND rat>=?3` |
| 28302 | 13M | `SELECT COUNT(*) n FROM businesses WHERE cs=?1 AND hood=?2 AND claimed=?3` |
| 34313 | 12M | `SELECT COUNT(*) n FROM businesses WHERE cs=?1 AND hood=?2` |
| 2535 | 11M | `SELECT * FROM businesses WHERE cs=? ORDER BY premium DESC, claimed DESC, rat DESC, rev DESC LIMIT ?` |
| 4013 | 10M | `SELECT sub,COUNT(*) n FROM businesses WHERE cs=?1 AND hood=?2 AND rat>=?3 AND claimed=?4 AND sub<>'' GROUP BY sub` |
| 3073 | 6M | `SELECT sub,COUNT(*) n FROM businesses WHERE cs=?1 AND rat>=?2 AND sub<>'' GROUP BY sub` |

## Changes shipped 25 Sep 2026 (evening)

| Version | Time (UTC) | What | Expected effect |
|---|---|---|---|
| v15.84 | 19:05–19:15 | Edge cache (Cache API) for public pages, 1 h (home 10 min, blog/news 15 min, sitemaps 12 h); junk/tracking params ignored in the key | Repeat hits (mostly bots) skip D1 entirely |
| — | ~18:50 | 4 indexes created live on both D1s (`ix_cs_hood_sub`, `ix_cs_sub_rank`, `ix_cs_rank`, `ix_cs_related`) — one-off ~62k rows written each city | Filter counts / listing lists read tens of rows instead of whole categories |
| v15.85 | 19:25–19:40 | `shell()` counts shared via `meta.shell_v1` (30 min); no FTS rebuild per `insertOne`; FTS rebuild only when something changed; invite job ≤ once/6 h per business; view tracking moved to a browser beacon | Removes ~1B rows/day (Miami shell scans), ~2.8k rebuilds/day, most GHL calls |
| v15.86 | 19:50 | robots.txt also blocks `hood`/`sub` filters and `/search`, `Crawl-delay: 5`; `X-Robots-Tag: noindex, follow` on filtered views; `rel=nofollow` on filter links | Crawlers stop walking filter combinations (Applebot re-reads robots.txt within ~a day) |

Already in place: $10 total-spend budget alert (auto-created) on the account.

Pending: Phase A (Bot Fight Mode, WAF rules, rate limit) — token lacks Zone WAF/Bot permissions. Phase C step 8 (shorten combined sub-category URLs) — needs Eric's decision.

## After — first measurements (25 Sep, 20:20 UTC)

| Hour (UTC) | Miami rows read | Orlando rows read | Note |
|---|---|---|---|
| 14:00–17:00 (baseline) | 107–145M/h | 41–57M/h | before any change |
| 18:00 | 104M | 39M | Smart Placement, v15.81 robots |
| 19:00 | 42M | 16M | v15.84–v15.89 rolled out during the hour |
| 20:00–20:21 | 10.4M in 21 min ≈ **30M/h** | 3.6M in 21 min ≈ **10M/h** | all changes + WAF live |

≈ **−75% to −80%** so far. Projected: Miami ~0.7B/day, Orlando ~0.25B/day (target < 0.1B each) → ~28B/month, just over the 25B allowance (~$3/month).

What's left: almost all remaining reads are hood/rating/claim facet counts on filtered **sub-category** pages (`WHERE cs=? AND sub=? AND … GROUP BY hood`), i.e. crawlers still walking filter combinations. Applebot passes the WAF as a known crawler and hasn't re-read robots.txt yet (usually within ~24 h). Re-measure 26 Sep (scheduled). If it hasn't dropped: stop computing facet counts on filtered views for crawlers, or precompute per-sub-category hood counts.

## After — 24 h (checked 26 Sep, 16:35 UTC)

| Day (UTC) | Miami rows read | Orlando rows read |
|---|---|---|
| 19–25 Sep (before) | 2.5–4.0B/day | 0.4–1.1B/day |
| 26 Sep, 00:00–17:00 | 0.10B (≈0.14B/day pace) | 0.22B |
| 26 Sep, last 3 hours | 0.8–1.3M/h | 0.6–6.4M/h |

Miami is down about 96%. Orlando ran about 10M/h overnight and fell to under 1M/h from 15:00. At the current pace both cities together read well under 0.5B/day, which is under 15B/month and inside the 25B/month included in the Workers plan, so D1 reads should cost about $0. No further fix needed. The ASN 45102 block and extra indexes were not required: the WAF challenge rules, edge cache and robots.txt were enough.
