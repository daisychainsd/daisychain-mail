const BEEHIIV_API = "https://api.beehiiv.com/v2";

export type SubscribeResult =
  | { ok: true; status: number }
  | { ok: false; status: number; body: string };

export async function createSubscription(
  apiKey: string,
  publicationId: string,
  email: string,
  opts: { utm_source?: string; utm_medium?: string; reactivate_existing?: boolean }
): Promise<SubscribeResult> {
  const url = `${BEEHIIV_API}/publications/${publicationId}/subscriptions`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      email,
      utm_source: opts.utm_source,
      utm_medium: opts.utm_medium,
      reactivate_existing: opts.reactivate_existing ?? false,
    }),
  });

  const text = await res.text();
  if (res.ok) return { ok: true, status: res.status };

  const lower = text.toLowerCase();
  if (
    res.status === 409 ||
    res.status === 422 ||
    lower.includes("already") ||
    lower.includes("exist")
  ) {
    return { ok: true, status: res.status };
  }

  return { ok: false, status: res.status, body: text };
}
