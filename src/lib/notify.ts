const NOTIFY_EMAIL = process.env.NOTIFY_EMAIL ?? "playerdave@daisychainsd.com";

async function sendAlert(subject: string, html: string): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.error(`[notify] RESEND_API_KEY not set — skipping: ${subject}`);
    return;
  }

  await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: "DC Email API <noreply@daisychainsd.com>",
      to: [NOTIFY_EMAIL],
      subject,
      html,
    }),
  });
}

/** Alert on cron failures (rate limits, crashes, etc.) */
export async function notifyCronFailure(
  cronName: string,
  details: Record<string, unknown>
): Promise<void> {
  await sendAlert(
    `DC Email API: ${cronName} cron failed`,
    `The <strong>${cronName}</strong> cron job failed or had errors.<br><br>` +
      `<pre>${JSON.stringify(details, null, 2)}</pre><br>` +
      `<a href="https://vercel.com/daisychainsd/dc-email-api/logs">View Vercel Logs</a>`
  );
}

/** Alert when Shotgun API returns 401 (token expired). */
export async function notifyTokenExpired(service: string): Promise<void> {
  await sendAlert(
    `DC Email API: ${service} token expired`,
    `The <strong>${service}</strong> API returned <code>401 Unauthorized</code>. The API token has expired.<br><br>` +
      `<strong>To fix:</strong><br>` +
      `1. Go to <a href="https://shotgun.live">Shotgun</a> → Settings → Integrations → Shotgun APIs → Issue token<br>` +
      `2. Copy the new token<br>` +
      `3. Update <code>SHOTGUN_API_TOKEN</code> in <a href="https://vercel.com/playerdave-1800s-projects/dc-email-api/settings/environment-variables">Vercel env vars</a><br>` +
      `4. Redeploy (push an empty commit or click Redeploy in Vercel dashboard)`
  );
}

/** Alert when no Laylo webhooks have been received for 7+ days. */
export async function notifyLayloSilent(daysSince: number): Promise<void> {
  await sendAlert(
    `DC Email API: No Laylo webhooks in ${daysSince} days`,
    `The Laylo webhook endpoint hasn't received any fan signups in <strong>${daysSince} days</strong>.<br><br>` +
      `This could mean:<br>` +
      `- The Laylo webhook URL was changed or disabled in Laylo settings<br>` +
      `- Laylo is down or their webhook delivery is broken<br>` +
      `- No new fan signups happened (unlikely over 7 days)<br><br>` +
      `<strong>To check:</strong> Go to <a href="https://laylo.com">Laylo</a> → Settings → Webhooks and verify the endpoint URL is still <code>https://dc-email-api.vercel.app/api/webhooks/laylo</code>`
  );
}
