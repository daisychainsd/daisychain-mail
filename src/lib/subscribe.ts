import { createSubscription } from "./beehiiv";
import { normalizeEmail } from "./normalize";

export async function subscribeWithSource(
  rawEmail: string,
  source: string
): Promise<{ ok: true } | { ok: false; reason: string }> {
  const email = normalizeEmail(rawEmail);
  if (!email) return { ok: false, reason: "invalid_email" };

  const apiKey = process.env.BEEHIIV_API_KEY;
  const publicationId = process.env.BEEHIIV_PUBLICATION_ID;
  if (!apiKey || !publicationId) {
    return { ok: false, reason: "missing_beehiiv_env" };
  }

  const result = await createSubscription(apiKey, publicationId, email, {
    utm_source: source,
    utm_medium: "daisychain-mail",
  });

  if (result.ok) return { ok: true };
  return { ok: false, reason: `beehiiv_${result.status}: ${result.body}` };
}
