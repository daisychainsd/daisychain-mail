export type ShotgunTicket = {
  contact_email: string | null;
  ordered_at: string | null;
};

type ShotgunResponse = {
  pagination: { next?: string };
  data: ShotgunTicket[];
};

async function fetchPage(url: string, token: string): Promise<ShotgunResponse> {
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Shotgun API error ${res.status}: ${text}`);
  }
  return res.json();
}

/**
 * Fetch all tickets for an organizer updated after `after` (ISO string cursor).
 * Follows pagination automatically. Returns all tickets and the next cursor
 * to store for the following run.
 */
export async function fetchAllTickets(
  token: string,
  organizerId: string,
  after?: string
): Promise<{ tickets: ShotgunTicket[]; nextCursor: string | null }> {
  const base = "https://api.shotgun.live/tickets";
  const params = new URLSearchParams({ organizer_id: organizerId });
  if (after) params.set("after", after);

  let url: string | undefined = `${base}?${params}`;
  const tickets: ShotgunTicket[] = [];
  let nextCursor: string | null = null;

  while (url) {
    const page = await fetchPage(url, token);
    tickets.push(...page.data);

    const nextUrl = page.pagination?.next;
    if (nextUrl) {
      // Extract the `after` value from the next URL to use as the cursor
      try {
        const parsed = new URL(nextUrl);
        nextCursor = parsed.searchParams.get("after");
      } catch {
        nextCursor = null;
      }
      url = nextUrl;
    } else {
      url = undefined;
    }
  }

  return { tickets, nextCursor };
}
