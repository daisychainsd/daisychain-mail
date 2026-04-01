# Daisy Chain Mail — Project Overview

## What this is

A subscriber sync service that automatically moves fan emails from Daisy Chain's platforms into Beehiiv (the newsletter). Built with Next.js (App Router), deployed on Vercel.

**Laylo is the central hub** — all ticket sales (Shotgun), merch, RSVPs, and website signups flow into Laylo first, then into this service via webhook. Bandcamp is the only platform that feeds directly (bypassing Laylo).

## What it does today

- **Bandcamp → Beehiiv**: A daily cron job (15:00 UTC) calls the Bandcamp sales API, pulls buyer emails since the last run, and subscribes them to Beehiiv. OAuth tokens are fetched automatically from Client ID + Secret and cached in Redis.
- **Laylo → Beehiiv**: A live webhook endpoint receives every fan sign-up event from Laylo (HMAC-SHA256 verified) and subscribes the email in real time. Covers all downstream sources: Shotgun tickets, website signups, RSVPs, and any future platform connected to Laylo.
- **CSV import scripts**: Standalone local scripts for one-time historical imports. Deduplication is safe to re-run — Beehiiv treats existing subscribers as a no-op.
- **Cursor persistence**: After each Bandcamp run, the end-time is stored in Redis (Upstash) so the next run starts from the last processed sale.

## Subscriber counts (as of Apr 2026 initial import)

| Source | Approx. subscribers added |
|--------|--------------------------|
| Bandcamp (historical Aug 2024 – Mar 2026) | ~1,275 |
| Laylo (historical full export) | ~1,863 unique |
| Shotgun (historical audience CSV) | ~2,205 (duplicates handled by Beehiiv) |

## Architecture

```
Vercel Cron (daily 15:00 UTC)
  └─ GET /api/cron/bandcamp
       ├─ bandcampAuth.ts  → oauth_token (client_credentials, cached in Redis)
       ├─ bandcamp.ts      → sales_report v4 API
       ├─ processBandcamp.ts → throttled subscribe loop (300ms/req)
       └─ subscribe.ts     → beehiiv.ts → POST /v2/publications/{id}/subscriptions

Laylo webhook (real-time, all sources)
  └─ POST /api/webhooks/laylo
       ├─ verify HMAC-SHA256 (X-Laylo-Timestamp + X-Signature-256)
       └─ extractEmail.ts → subscribe.ts → beehiiv.ts

CSV import (one-time historical, run locally)
  └─ node scripts/import-laylo-csv.mjs   — Laylo fan export
  └─ node scripts/import-shotgun-csv.mjs — Shotgun audience export
  └─ node scripts/backfill-local.mjs     — Bandcamp historical windows
```

## Environment variables

| Variable | Purpose |
|----------|---------|
| `BEEHIIV_API_KEY` | Beehiiv Bearer token (Settings → API) |
| `BEEHIIV_PUBLICATION_ID` | `pub_c63c3433-d698-4e9b-b9cc-de4a2af0b2ed` |
| `BANDCAMP_CLIENT_ID` | Bandcamp OAuth app id (`2358`) |
| `BANDCAMP_CLIENT_SECRET` | Bandcamp OAuth app secret |
| `BANDCAMP_BAND_ID` | Daisy Chain label id (`1409963757`) |
| `BANDCAMP_INITIAL_START_TIME` | Lower bound for first cron run (`2026-01-01 00:00:00`) |
| `CRON_SECRET` | Protects `GET /api/cron/bandcamp` |
| `INTERNAL_SECRET` | Protects `/api/internal/*` routes |
| `LAYLO_WEBHOOK_SECRET` | Laylo-generated secret for HMAC-SHA256 webhook verification |
| `UPSTASH_REDIS_REST_URL` | Upstash Redis (cursor + token cache) |
| `UPSTASH_REDIS_REST_TOKEN` | Upstash Redis token |

## API routes

| Route | Method | Auth | Purpose |
|-------|--------|------|---------|
| `/api/cron/bandcamp` | GET | `CRON_SECRET` | Daily Bandcamp sync |
| `/api/webhooks/laylo` | POST | HMAC-SHA256 | Real-time Laylo fan signups |
| `/api/internal/backfill` | POST | `INTERNAL_SECRET` | Trigger Bandcamp backfill for a date window |
| `/api/internal/import-csv` | POST | `INTERNAL_SECRET` | Bulk import from a CSV file body |

## Source files

```
src/
  app/
    api/
      cron/bandcamp/route.ts       — daily Bandcamp cron handler
      webhooks/laylo/route.ts      — Laylo webhook handler (HMAC-SHA256 verified)
      internal/backfill/route.ts   — admin: Bandcamp backfill by date range
      internal/import-csv/route.ts — admin: CSV bulk import
  lib/
    bandcamp.ts        — Bandcamp sales_report API client
    bandcampAuth.ts    — OAuth token fetch + Redis cache
    beehiiv.ts         — Beehiiv subscribe API client (with retry + backoff)
    extractEmail.ts    — Extract email from unknown webhook payload shape
    normalize.ts       — Trim + lowercase email, reject invalid
    processBandcamp.ts — Loop sales report, throttle, subscribe
    state.ts           — Redis cursor read/write
    subscribe.ts       — normalise → Beehiiv (shared by all sources)
    auth.ts            — Bearer token check helper
scripts/
  backfill-local.mjs      — historical Bandcamp import (chunked date windows)
  import-laylo-csv.mjs    — historical Laylo fan CSV import
  import-shotgun-csv.mjs  — historical Shotgun audience CSV import
```

## Running a CSV import locally

```bash
# Laylo
BEEHIIV_API_KEY=xxx BEEHIIV_PUBLICATION_ID=pub_xxx \
  node scripts/import-laylo-csv.mjs /path/to/laylo-export.csv

# Shotgun
BEEHIIV_API_KEY=xxx BEEHIIV_PUBLICATION_ID=pub_xxx \
  node scripts/import-shotgun-csv.mjs /path/to/audience.csv
```

Both scripts skip rows with no email, deduplicate, throttle at 300ms/request, and retry on network errors or rate limits.

## Remaining to-do

- **Verify Shotgun CSV fully completed** — check terminal output for final `subscribed / failed` count
- **Bandcamp before August 2024** — if older sales exist, add an earlier window to `scripts/backfill-local.mjs` and re-run

## Future ideas

- **Shopify orders → Beehiiv**: If merch ever moves off Laylo, add a `/api/webhooks/shopify` route with HMAC-SHA256 verification (same pattern as Laylo).
- **Beehiiv segments by source**: All subscribers are tagged with `utm_source`. In Beehiiv, create segments (bandcamp, laylo, shotgun) to send targeted campaigns to each audience.
- **Token auto-rotate reminder**: Bandcamp OAuth tokens are fetched automatically but the refresh token may expire. Add a Vercel Log Drain or email alert if Bandcamp auth fails in cron.
- **Upgrade to Vercel Pro**: Unlocks hourly cron (currently daily on Hobby). Worth it once subscriber volume justifies more frequent Bandcamp syncs.
- **Admin dashboard**: A simple password-protected page at `/admin` showing last sync time, subscriber counts per source, and a button to trigger backfill — so non-technical team members can monitor without Vercel access.
- **Laylo as master list**: Since all platforms funnel through Laylo, consider Laylo the canonical fan database and use Beehiiv purely for email sends. Segment campaigns by Laylo acquisition channel for better targeting.
