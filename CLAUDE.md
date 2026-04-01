# Daisy Chain Mail — Project Overview

## What this is

A subscriber sync service that automatically moves fan emails from Daisy Chain's sales and ticketing platforms into Beehiiv (the newsletter). Built with Next.js (App Router), deployed on Vercel.

## What it does today

- **Bandcamp → Beehiiv**: A daily cron job (15:00 UTC) calls the Bandcamp sales API, pulls buyer emails since the last run, and subscribes them to the Beehiiv publication. OAuth tokens are fetched automatically from Client ID + Secret and cached in Redis.
- **Laylo → Beehiiv**: A webhook endpoint receives fan sign-up events from Laylo and subscribes the email.
- **CSV import**: A protected endpoint accepts a raw CSV file (e.g. from Shotgun) and bulk-subscribes emails to Beehiiv. Each subscriber is tagged with a `utm_source` matching their origin platform (bandcamp, laylo, shotgun, etc.).
- **Deduplication**: Emails are normalised (trimmed, lowercased) before every Beehiiv call. Beehiiv treats existing subscribers as a no-op, so re-running imports is safe.
- **Cursor persistence**: After each Bandcamp run, the end-time is stored in Redis (Upstash) so the next run starts from there rather than the beginning of time.

## Current subscriber counts (as of initial import)

| Source | Approx. subscribers added |
|--------|--------------------------|
| Bandcamp (historical Aug 2024 – Mar 2026) | ~1,275 |
| Shotgun | pending CSV import |
| Laylo | pending CSV import or webhook config |

## Architecture

```
Vercel Cron (daily 15:00 UTC)
  └─ GET /api/cron/bandcamp
       ├─ bandcampAuth.ts  → oauth_token (client_credentials, cached in Redis)
       ├─ bandcamp.ts      → sales_report v4 API
       ├─ processBandcamp.ts → throttled subscribe loop (300ms/req)
       └─ subscribe.ts     → beehiiv.ts → POST /v2/publications/{id}/subscriptions

Laylo webhook
  └─ POST /api/webhooks/laylo
       └─ extractEmail.ts → subscribe.ts → beehiiv.ts

CSV import (one-time or periodic)
  └─ POST /api/internal/import-csv?source=shotgun
       └─ parse CSV → normalizeEmail → subscribe.ts → beehiiv.ts

Historical backfill (local script)
  └─ node scripts/backfill-local.mjs
       └─ same Bandcamp + Beehiiv path, chunked by date window
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
| `LAYLO_WEBHOOK_SECRET` | Shared secret for Laylo webhook header |
| `UPSTASH_REDIS_REST_URL` | Upstash Redis (cursor + token cache) |
| `UPSTASH_REDIS_REST_TOKEN` | Upstash Redis token |

## API routes

| Route | Method | Auth | Purpose |
|-------|--------|------|---------|
| `/api/cron/bandcamp` | GET | `CRON_SECRET` | Daily Bandcamp sync |
| `/api/webhooks/laylo` | POST | `LAYLO_WEBHOOK_SECRET` | Real-time Laylo fan signups |
| `/api/internal/backfill` | POST | `INTERNAL_SECRET` | Trigger Bandcamp backfill for a date window |
| `/api/internal/import-csv` | POST | `INTERNAL_SECRET` | Bulk import from a CSV file body |

## Source files

```
src/
  app/
    api/
      cron/bandcamp/route.ts       — daily Bandcamp cron handler
      webhooks/laylo/route.ts      — Laylo webhook handler
      internal/backfill/route.ts   — admin: Bandcamp backfill by date range
      internal/import-csv/route.ts — admin: CSV bulk import
  lib/
    bandcamp.ts       — Bandcamp sales_report API client
    bandcampAuth.ts   — OAuth token fetch + Redis cache
    beehiiv.ts        — Beehiiv subscribe API client (with retry + backoff)
    extractEmail.ts   — Extract email from unknown webhook payload shape
    normalize.ts      — Trim + lowercase email, reject invalid
    processBandcamp.ts — Loop sales report, throttle, subscribe
    state.ts          — Redis cursor read/write
    subscribe.ts      — normalise → Beehiiv (shared by all sources)
    auth.ts           — Bearer token check helper
scripts/
  backfill-local.mjs  — run locally to import historical Bandcamp windows
```

## Remaining to-do

- **Shotgun CSV import** — export attendee CSV from Shotgun dashboard, run:
  ```bash
  curl -X POST "https://daisychain-mail.vercel.app/api/internal/import-csv?source=shotgun" \
    -H "Authorization: Bearer $INTERNAL_SECRET" \
    -H "Content-Type: text/csv" \
    --data-binary @shotgun-export.csv
  ```
- **Laylo CSV or webhook** — either export fan CSV the same way (`source=laylo`), or configure Laylo to POST to `/api/webhooks/laylo` with `x-webhook-secret` header matching `LAYLO_WEBHOOK_SECRET`.
- **Bandcamp before August 2024** — if older sales exist, add an earlier window to `scripts/backfill-local.mjs` and re-run.

## Future ideas

- **Shopify orders → Beehiiv**: Daisy Chain's Shopify store could be another source. Shopify webhooks follow the same pattern as Laylo — add a `/api/webhooks/shopify` route with HMAC verification, extract email, subscribe.
- **Shotgun ongoing sync**: Shotgun may expose a webhook or API. Once confirmed, add a `/api/webhooks/shotgun` route instead of periodic CSV exports.
- **Laylo ongoing sync**: Laylo's partner SDK sends conversion events. The existing webhook handler accepts those; finalise the shared secret with Laylo to go live.
- **Beehiiv segments by source**: All subscribers are currently tagged with `utm_source`. In Beehiiv, create **segments** (bandcamp, laylo, shotgun) to send targeted campaigns to each audience.
- **Token auto-rotate reminder**: Bandcamp OAuth tokens are fetched automatically but the refresh token may expire over time. Add a Vercel Log Drain or email alert if Bandcamp auth fails in cron.
- **Upgrade to Vercel Pro**: Unlocks hourly cron (currently daily on Hobby). Worth it once the subscriber volume justifies more frequent syncs.
- **Admin dashboard**: A simple password-protected page at `/admin` showing last sync time, subscriber counts per source, and a button to trigger backfill — so non-technical team members can monitor without Vercel access.
