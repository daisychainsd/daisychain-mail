const BEEHIIV_API = "https://api.beehiiv.com/v2";

export type SubscribeResult =
  | { ok: true; status: number; existing: boolean }
  | { ok: false; status: number; body: string };

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function createSubscriptionOnce(
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
  if (res.ok) return { ok: true, status: res.status, existing: false };

  const lower = text.toLowerCase();
  if (
    res.status === 409 ||
    res.status === 422 ||
    lower.includes("already") ||
    lower.includes("exist")
  ) {
    return { ok: true, status: res.status, existing: true };
  }

  return { ok: false, status: res.status, body: text };
}

export async function createSubscription(
  apiKey: string,
  publicationId: string,
  email: string,
  opts: { utm_source?: string; utm_medium?: string; reactivate_existing?: boolean }
): Promise<SubscribeResult> {
  const maxRetries = 3;
  let lastResult: SubscribeResult = { ok: false, status: 0, body: "no attempt" };

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    if (attempt > 0) {
      // exponential backoff: 2s, 4s
      await sleep(2000 * attempt);
    }

    const result = await createSubscriptionOnce(apiKey, publicationId, email, opts);

    if (result.ok) return result;

    // retry on rate limit or server error
    if (result.status === 429 || result.status >= 500) {
      if (result.status === 429) {
        await sleep(3000);
      }
      lastResult = result;
      continue;
    }

    // non-retryable error
    return result;
  }

  return lastResult;
}
