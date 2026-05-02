const NOTIFY_EMAIL = process.env.NOTIFY_EMAIL ?? "playerdave@daisychainsd.com";

/**
 * Send a failure notification email via Resend.
 * Requires RESEND_API_KEY env var. Silently no-ops if not configured.
 */
export async function notifyCronFailure(
  cronName: string,
  details: Record<string, unknown>
): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.error(`[notify] RESEND_API_KEY not set — skipping ${cronName} failure alert`);
    console.error(`[notify] details:`, JSON.stringify(details));
    return;
  }

  const subject = `DC Email API: ${cronName} cron failed`;
  const body = `The <strong>${cronName}</strong> cron job failed or had errors.<br><br>` +
    `<pre>${JSON.stringify(details, null, 2)}</pre><br>` +
    `<a href="https://vercel.com/daisychainsd/dc-email-api/logs">View Vercel Logs</a>`;

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
      html: body,
    }),
  });
}
