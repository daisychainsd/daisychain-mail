# Daisy Chain Mail

Node/TypeScript subscriber sync for [Vercel](https://vercel.com): polls **Bandcamp** sales, accepts **Laylo** webhooks, and subscribes emails to **Beehiiv**. Optional **CSV import** for Shotgun or other exports.

## Setup

1. **Install**

   ```bash
   npm install
   ```

2. **Environment variables**

   Copy [`.env.example`](.env.example) to `.env.local` and fill in values.

   | Variable | Purpose |
   |---|---|
   | `BEEHIIV_API_KEY` | Beehiiv API key (Settings → API) |
   | `BEEHIIV_PUBLICATION_ID` | Publication UUID |
   | `BANDCAMP_ACCESS_TOKEN` | OAuth Bearer token from Bandcamp |
   | `BANDCAMP_BAND_ID` | Numeric band/label id ([my_bands](https://bandcamp.com/developer/account)) |
   | `BANDCAMP_MEMBER_BAND_ID` | Optional; filter when calling as a label |
   | `BANDCAMP_INITIAL_START_TIME` | First poll window start if no Redis cursor (UTC) |
   | `CRON_SECRET` | Protects `GET /api/cron/bandcamp` (Vercel Cron sends `Authorization: Bearer …`) |
   | `INTERNAL_SECRET` | Protects `POST /api/internal/backfill` and `POST /api/internal/import-csv` |
   | `LAYLO_WEBHOOK_SECRET` | Laylo must send `x-webhook-secret` or `Authorization: Bearer` with this value |
   | `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN` | Upstash Redis (Vercel Marketplace) — **recommended** so Bandcamp cursor survives deploys |

3. **Redis (Upstash)**

   In the Vercel project: [Marketplace](https://vercel.com/marketplace?category=storage) → add **Redis** (Upstash). Link it to the project so `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` are set. Without Redis, the Bandcamp cursor is not persisted and each cron may reprocess from `BANDCAMP_INITIAL_START_TIME`.

4. **Cron**

   [`vercel.json`](vercel.json) schedules `GET /api/cron/bandcamp` hourly. Set `CRON_SECRET` in Vercel; [securing cron jobs](https://vercel.com/docs/cron-jobs#securing-cron-jobs) uses the same `Authorization` header.

5. **Laylo**

   Point Laylo’s webhook URL to `https://<your-domain>/api/webhooks/laylo` and configure a shared secret in `LAYLO_WEBHOOK_SECRET`. The handler expects JSON with an email at `email`, `user.email`, or `data.email` (extend [`src/lib/extractEmail.ts`](src/lib/extractEmail.ts) if your payload differs).

## One-time Bandcamp backfill

```bash
curl -X POST "https://<your-domain>/api/internal/backfill" \
  -H "Authorization: Bearer $INTERNAL_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"start_time":"2015-01-01 00:00:00","end_time":"2026-03-31 23:59:59","advance_cursor":true}'
```

`advance_cursor: true` (default) stores `end_time` in Redis so hourly cron continues after the backfill.

## Shotgun / CSV import

Export a CSV with an `email` column (header row optional). Send the raw file body:

```bash
curl -X POST "https://<your-domain>/api/internal/import-csv?source=shotgun" \
  -H "Authorization: Bearer $INTERNAL_SECRET" \
  -H "Content-Type: text/csv" \
  --data-binary @shotgun-fans.csv
```

## Local dev

```bash
npm run dev
```

Trigger cron locally:

```bash
curl -s "http://localhost:3000/api/cron/bandcamp" -H "Authorization: Bearer $CRON_SECRET"
```

## Bandcamp token refresh

OAuth access tokens expire. Refresh via `https://bandcamp.com/oauth_token` using your client id/secret (see [Bandcamp developer docs](https://bandcamp.com/developer)). For production, add a refresh flow or rotate `BANDCAMP_ACCESS_TOKEN` in Vercel when Bandcamp issues a new token.
