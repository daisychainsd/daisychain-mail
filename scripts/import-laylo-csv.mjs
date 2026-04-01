/**
 * Import Laylo fan emails from a CSV export into Beehiiv.
 *
 * Usage:
 *   BEEHIIV_API_KEY=xxx BEEHIIV_PUBLICATION_ID=pub_xxx \
 *     node scripts/import-laylo-csv.mjs /path/to/laylo-export.csv
 *
 * The script expects the Laylo CSV format:
 *   "Email","Phone","Messenger","City","State","Country",...
 * Rows with no email (phone-only fans) are skipped automatically.
 */

import { createReadStream } from "fs";
import { createInterface } from "readline";

const BEEHIIV_API_KEY = process.env.BEEHIIV_API_KEY;
const BEEHIIV_PUB_ID  = process.env.BEEHIIV_PUBLICATION_ID;
const CSV_PATH        = process.argv[2];

const sleep = ms => new Promise(r => setTimeout(r, ms));

function normalizeEmail(raw) {
  if (!raw || typeof raw !== "string") return null;
  const e = raw.trim().toLowerCase();
  if (!e || !e.includes("@")) return null;
  return e;
}

async function subscribe(email) {
  for (let attempt = 0; attempt < 3; attempt++) {
    if (attempt > 0) await sleep(3000);
    const res = await fetch(
      `https://api.beehiiv.com/v2/publications/${BEEHIIV_PUB_ID}/subscriptions`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${BEEHIIV_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email,
          utm_source: "laylo",
          utm_medium: "daisychain-import",
        }),
      }
    );
    if (res.ok) return "ok";
    const text = await res.text();
    if (res.status === 409 || res.status === 422 || text.toLowerCase().includes("already")) return "ok";
    if (res.status === 429 || res.status >= 500) {
      await sleep(3000);
      continue;
    }
    return `fail:${res.status}`;
  }
  return "fail:exhausted";
}

async function readEmails(csvPath) {
  const emails = [];
  const rl = createInterface({ input: createReadStream(csvPath), crlfDelay: Infinity });

  let isFirstLine = true;
  let emailColIndex = 0;

  for await (const line of rl) {
    if (!line.trim()) continue;

    if (isFirstLine) {
      isFirstLine = false;
      const headers = line.split(",").map(h => h.replace(/^"|"$/g, "").trim().toLowerCase());
      emailColIndex = headers.findIndex(h => h === "email");
      if (emailColIndex === -1) emailColIndex = 0;
      continue;
    }

    // Parse fields up to emailColIndex
    const fields = [];
    let rest = line;
    let fieldCount = 0;
    while (rest.length > 0 && fieldCount <= emailColIndex) {
      if (rest.startsWith('"')) {
        const closeQuote = rest.indexOf('"', 1);
        const value = closeQuote === -1 ? rest.slice(1) : rest.slice(1, closeQuote);
        fields.push(value.trim());
        rest = closeQuote === -1 ? "" : rest.slice(closeQuote + 1);
        if (rest.startsWith(",")) rest = rest.slice(1);
      } else {
        const commaIdx = rest.indexOf(",");
        if (commaIdx === -1) {
          fields.push(rest.trim());
          rest = "";
        } else {
          fields.push(rest.slice(0, commaIdx).trim());
          rest = rest.slice(commaIdx + 1);
        }
      }
      fieldCount++;
    }

    const raw = fields[emailColIndex] ?? "";
    const email = normalizeEmail(raw);
    if (email) emails.push(email);
  }

  return emails;
}

async function run() {
  if (!BEEHIIV_API_KEY || !BEEHIIV_PUB_ID) {
    console.error("Missing env vars. Set BEEHIIV_API_KEY and BEEHIIV_PUBLICATION_ID.");
    process.exit(1);
  }
  if (!CSV_PATH) {
    console.error("Usage: node scripts/import-laylo-csv.mjs /path/to/file.csv");
    process.exit(1);
  }

  console.log(`Reading CSV: ${CSV_PATH}`);
  const allEmails = await readEmails(CSV_PATH);

  const unique = [...new Set(allEmails)];
  console.log(`Found ${allEmails.length} email rows -> ${unique.length} unique after dedup\n`);

  let subscribed = 0, failed = 0;

  for (let i = 0; i < unique.length; i++) {
    await sleep(300);
    const result = await subscribe(unique[i]);
    if (result === "ok") subscribed++;
    else {
      failed++;
      console.log(`  FAIL: ${unique[i]} -- ${result}`);
    }
    if ((i + 1) % 50 === 0) {
      console.log(`  ...${i + 1}/${unique.length} processed`);
    }
  }

  console.log(`\nDone. subscribed: ${subscribed}  failed: ${failed}`);
}

run().catch(e => { console.error(e); process.exit(1); });
