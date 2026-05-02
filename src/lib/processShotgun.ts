import { fetchAllTickets } from "./shotgun";
import { subscribeWithSource } from "./subscribe";
import { normalizeEmail } from "./normalize";

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

export async function processShotgunTickets(
  token: string,
  organizerId: string,
  after?: string
): Promise<ProcessShotgunResult> {
  const { tickets, nextCursor } = await fetchAllTickets(token, organizerId, after);

  const result: ProcessShotgunResult = {
    tickets: tickets.length,
    subscribed: 0,
    newSubscribers: 0,
    existingSubscribers: 0,
    skippedNoEmail: 0,
    failed: 0,
    errors: [],
    nextCursor,
  };

  for (let i = 0; i < tickets.length; i++) {
    const email = normalizeEmail(tickets[i].contact_email);
    if (!email) {
      result.skippedNoEmail += 1;
      continue;
    }

    if (i > 0) await sleep(100);

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

  return result;
}
