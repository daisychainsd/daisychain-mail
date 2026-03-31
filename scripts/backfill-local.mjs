const BANDCAMP_CLIENT_ID     = process.env.BANDCAMP_CLIENT_ID;
const BANDCAMP_CLIENT_SECRET = process.env.BANDCAMP_CLIENT_SECRET;
const BANDCAMP_BAND_ID       = Number(process.env.BANDCAMP_BAND_ID);
const BEEHIIV_API_KEY        = process.env.BEEHIIV_API_KEY;
const BEEHIIV_PUB_ID         = process.env.BEEHIIV_PUBLICATION_ID;

const WINDOWS = [
  { start: "2024-08-01 00:00:00", end: "2025-01-01 00:00:00" },
  { start: "2025-01-01 00:00:00", end: "2025-07-01 00:00:00" },
  { start: "2025-07-01 00:00:00", end: "2026-01-01 00:00:00" },
];

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function getToken() {
  const res = await fetch("https://bandcamp.com/oauth_token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_id: BANDCAMP_CLIENT_ID,
      client_secret: BANDCAMP_CLIENT_SECRET,
    }),
  });
  const data = await res.json();
  if (!data.access_token) throw new Error("Bandcamp auth failed: " + JSON.stringify(data));
  return data.access_token;
}

async function fetchSales(token, start, end) {
  const res = await fetch("https://bandcamp.com/api/sales/4/sales_report", {
    method: "POST",
    headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" },
    body: JSON.stringify({ band_id: BANDCAMP_BAND_ID, start_time: start, end_time: end }),
  });
  const data = await res.json();
  return data.report ?? [];
}

async function subscribe(email) {
  for (let attempt = 0; attempt < 3; attempt++) {
    if (attempt > 0) await sleep(3000);
    const res = await fetch(
      "https://api.beehiiv.com/v2/publications/" + BEEHIIV_PUB_ID + "/subscriptions",
      {
        method: "POST",
        headers: { Authorization: "Bearer " + BEEHIIV_API_KEY, "Content-Type": "application/json" },
        body: JSON.stringify({ email, utm_source: "bandcamp", utm_medium: "daisychain-backfill" }),
      }
    );
    if (res.ok) return "ok";
    const text = await res.text();
    if (res.status === 409 || res.status === 422 || text.toLowerCase().includes("already")) return "ok";
    if (res.status === 429 || res.status >= 500) { await sleep(3000); continue; }
    return "fail:" + res.status;
  }
  return "fail:exhausted";
}

async function run() {
  if (!BANDCAMP_CLIENT_ID || !BANDCAMP_CLIENT_SECRET || !BANDCAMP_BAND_ID || !BEEHIIV_API_KEY || !BEEHIIV_PUB_ID) {
    console.error("Missing env vars. Set BANDCAMP_CLIENT_ID, BANDCAMP_CLIENT_SECRET, BANDCAMP_BAND_ID, BEEHIIV_API_KEY, BEEHIIV_PUBLICATION_ID");
    process.exit(1);
  }

  console.log("Fetching Bandcamp token...");
  const token = await getToken();
  console.log("Token OK.\n");

  for (const { start, end } of WINDOWS) {
    console.log("Window: " + start + " to " + end);
    const report = await fetchSales(token, start, end);
    console.log("  " + report.length + " line items");

    let subscribed = 0, skipped = 0, failed = 0;
    const seen = new Set();

    for (let i = 0; i < report.length; i++) {
      const raw = report[i].buyer_email;
      const email = typeof raw === "string" ? raw.trim().toLowerCase() : null;
      if (!email || !email.includes("@")) { skipped++; continue; }
      if (seen.has(email)) { skipped++; continue; }
      seen.add(email);

      await sleep(300);
      const result = await subscribe(email);
      if (result === "ok") subscribed++;
      else { failed++; console.log("  FAIL:", email, result); }

      if ((i + 1) % 50 === 0) console.log("  ..." + (i + 1) + "/" + report.length);
    }

    console.log("  subscribed: " + subscribed + "  skipped: " + skipped + "  failed: " + failed + "\n");
  }

  console.log("Backfill complete.");
}

run().catch(e => { console.error(e); process.exit(1); });
