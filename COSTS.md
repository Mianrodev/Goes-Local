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
