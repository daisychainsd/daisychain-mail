import { subscribeWithSource } from "./subscribe";
import { normalizeEmail } from "./normalize";
import { setShotgunLastAfter } from "./state";

export type ProcessShotgunResult = {
  tickets: number;
  subscribed: number;
  newSubscribers: number;
  existingSubscribers: number;
  skippedNoEmail: number;
  failed: number;
  errors: string[];
  nextCursor: string | null;
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

type ShotgunTicket = { contact_email: string | null; ordered_at: string | null };
type ShotgunPage = { pagination: { next?: string }; data: ShotgunTicket[] };

async function fetchPage(url: string, token: string): Promise<ShotgunPage> {
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error(`Shotgun API error ${res.status}: ${await res.text()}`);
  return res.json();
}

/**
 * Process Shotgun tickets page-by-page, saving cursor after each page.
 * This ensures progress is preserved even if the function times out.
 */
export async function processShotgunTickets(
  token: string,
  organizerId: string,
  after?: string
): Promise<ProcessShotgunResult> {
  const base = "https://api.shotgun.live/tickets";
  const params = new URLSearchParams({ organizer_id: organizerId });
  if (after) params.set("after", after);

  let url: string | undefined = `${base}?${params}`;
  let pageCursor: string | null = null;

  const result: ProcessShotgunResult = {
    tickets: 0,
    subscribed: 0,
    newSubscribers: 0,
    existingSubscribers: 0,
    skippedNoEmail: 0,
    failed: 0,
    errors: [],
    nextCursor: null,
  };

  while (url) {
    const page = await fetchPage(url, token);
    result.tickets += page.data.length;

    // Process this page's tickets
    for (let i = 0; i < page.data.length; i++) {
      const email = normalizeEmail(page.data[i].contact_email);
      if (!email) {
        result.skippedNoEmail += 1;
        continue;
      }

      if (result.subscribed > 0 || i > 0) await sleep(100);

      const sub = await subscribeWithSource(email, "shotgun");
      if (sub.ok) {
        result.subscribed += 1;
        if (sub.existing) {
          result.existingSubscribers += 1;
        } else {
          result.newSubscribers += 1;
        }
      } else {
        result.failed += 1;
        if (result.errors.length < 20) result.errors.push(sub.reason);
      }
    }

    // Extract cursor and save progress after each page
    const nextUrl = page.pagination?.next;
    if (nextUrl) {
      try {
        pageCursor = new URL(nextUrl).searchParams.get("after");
      } catch {
        pageCursor = null;
      }
      if (pageCursor) {
        await setShotgunLastAfter(pageCursor);
      }
      url = nextUrl;
    } else {
      url = undefined;
    }
  }

  result.nextCursor = pageCursor;
  return result;
}
