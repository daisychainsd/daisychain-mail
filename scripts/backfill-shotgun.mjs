/**
 * One-time historical backfill of all Shotgun ticket buyer emails into Beehiiv.
 * Fetches every ticket ever purchased for your organizer account (no `after` cursor),
 * deduplicates, and subscribes each email with utm_source=shotgun.
 *
 * Usage:
 *   SHOTGUN_API_TOKEN=xxx SHOTGUN_ORGANIZER_ID=216831 \
 *   BEEHIIV_API_KEY=xxx BEEHIIV_PUBLICATION_ID=pub_xxx \
 *     node scripts/backfill-shotgun.mjs
 *
 * Safe to re-run — Beehiiv silently skips already-subscribed emails.
 */

const SHOTGUN_API_TOKEN   = process.env.SHOTGUN_API_TOKEN;
const SHOTGUN_ORGANIZER_ID = process.env.SHOTGUN_ORGANIZER_ID;
const BEEHIIV_API_KEY     = process.env.BEEHIIV_API_KEY;
const BEEHIIV_PUB_ID      = process.env.BEEHIIV_PUBLICATION_ID;

const sleep = ms => new Promise(r => setTimeout(r, ms));

function normalizeEmail(raw) {
  if (!raw || typeof raw !== "string") return null;
  const e = raw.trim().toLowerCase();
  if (!e || !e.includes("@")) return null;
  return e;
}

async function fetchPage(url) {
  let lastErr;
  for (let attempt = 0; attempt < 3; attempt++) {
    if (attempt > 0) await sleep(3000);
    try {
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${SHOTGUN_API_TOKEN}` },
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(`Shotgun ${res.status}: ${text}`);
      }
      return await res.json();
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr;
}

async function fetchAllTickets() {
  const base = `https://api.shotgun.live/tickets?organizer_id=${SHOTGUN_ORGANIZER_ID}`;
  let url = base;
  const tickets = [];
  let page = 1;

  while (url) {
    console.log(`  Fetching page ${page}...`);
    const data = await fetchPage(url);
    tickets.push(...(data.data ?? []));
    url = data.pagination?.next ?? null;
    page++;
  }

  return tickets;
}

async function subscribe(email) {
  for (let attempt = 0; attempt < 3; attempt++) {
    if (attempt > 0) await sleep(3000);
    let res;
    try {
      res = await fetch(
        `https://api.beehiiv.com/v2/publications/${BEEHIIV_PUB_ID}/subscriptions`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${BEEHIIV_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            email,
            utm_source: "shotgun",
            utm_medium: "daisychain-backfill",
          }),
        }
      );
    } catch {
      if (attempt < 2) { await sleep(3000); continue; }
      return "fail:network";
    }
    if (res.ok) return "ok";
    const text = await res.text();
    if (res.status === 409 || res.status === 422 || text.toLowerCase().includes("already")) return "ok";
    if (res.status === 429 || res.status >= 500) { await sleep(3000); continue; }
    return `fail:${res.status}`;
  }
  return "fail:exhausted";
}

async function run() {
  if (!SHOTGUN_API_TOKEN || !SHOTGUN_ORGANIZER_ID || !BEEHIIV_API_KEY || !BEEHIIV_PUB_ID) {
    console.error("Missing env vars. Set SHOTGUN_API_TOKEN, SHOTGUN_ORGANIZER_ID, BEEHIIV_API_KEY, BEEHIIV_PUBLICATION_ID");
    process.exit(1);
  }

  console.log("Fetching all Shotgun tickets...");
  const tickets = await fetchAllTickets();
  console.log(`Fetched ${tickets.length} total tickets.\n`);

  // Deduplicate emails
  const seen = new Set();
  const emails = [];
  for (const t of tickets) {
    const email = normalizeEmail(t.contact_email);
    if (email && !seen.has(email)) {
      seen.add(email);
      emails.push(email);
    }
  }
  console.log(`${emails.length} unique emails after dedup.\n`);

  let subscribed = 0, failed = 0;

  for (let i = 0; i < emails.length; i++) {
    await sleep(300);
    const result = await subscribe(emails[i]);
    if (result === "ok") subscribed++;
    else {
      failed++;
      console.log(`  FAIL: ${emails[i]} -- ${result}`);
    }
    if ((i + 1) % 50 === 0) {
      console.log(`  ...${i + 1}/${emails.length} processed`);
    }
  }

  console.log(`\nDone. subscribed: ${subscribed}  failed: ${failed}`);
}

run().catch(e => { console.error(e); process.exit(1); });
