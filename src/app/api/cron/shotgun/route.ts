import { NextRequest, NextResponse } from "next/server";
import { processShotgunTickets, ShotgunAuthError } from "@/lib/processShotgun";
import {
  getShotgunLastAfter,
  getLayloLastWebhook,
  getLayloSilenceAlerted,
  setLayloSilenceAlerted,
  getShotgunTokenAlerted,
  setShotgunTokenAlerted,
  redisConfigured,
} from "@/lib/state";
import { bearerMatches } from "@/lib/auth";
import { notifyCronFailure, notifyTokenExpired, notifyLayloSilent } from "@/lib/notify";

export const runtime = "nodejs";
export const maxDuration = 300;

const LAYLO_SILENCE_DAYS = 7;

async function checkLayloSilence(): Promise<void> {
  const lastWebhook = await getLayloLastWebhook();
  if (!lastWebhook) return; // no data yet, skip

  const daysSince = Math.floor(
    (Date.now() - new Date(lastWebhook).getTime()) / (1000 * 60 * 60 * 24)
  );

  if (daysSince >= LAYLO_SILENCE_DAYS) {
    const alreadyAlerted = await getLayloSilenceAlerted();
    if (!alreadyAlerted) {
      await notifyLayloSilent(daysSince);
      await setLayloSilenceAlerted();
    }
  }
}

export async function GET(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (!bearerMatches(request, cronSecret)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const token = process.env.SHOTGUN_API_TOKEN?.trim();
  if (!token) {
    return NextResponse.json({ error: "missing SHOTGUN_API_TOKEN" }, { status: 500 });
  }

  const organizerId = process.env.SHOTGUN_ORGANIZER_ID?.trim();
  if (!organizerId) {
    return NextResponse.json({ error: "missing SHOTGUN_ORGANIZER_ID" }, { status: 500 });
  }

  try {
    const stored = await getShotgunLastAfter();
    const after = stored ?? process.env.SHOTGUN_INITIAL_AFTER ?? undefined;

    const result = await processShotgunTickets(token, organizerId, after);

    const response = {
      ok: true,
      after: after ?? "beginning",
      tickets: result.tickets,
      subscribed: result.subscribed,
      newSubscribers: result.newSubscribers,
      existingSubscribers: result.existingSubscribers,
      skippedNoEmail: result.skippedNoEmail,
      failed: result.failed,
      errors: result.errors,
      nextCursor: result.nextCursor,
      redisConfigured: redisConfigured(),
      warning: redisConfigured()
        ? undefined
        : "Redis not configured: cursor not persisted. Add Upstash Redis from Vercel Marketplace.",
    };

    const failRate = result.tickets > 0 ? result.failed / result.tickets : 0;
    if (result.failed >= 5 || failRate > 0.1) {
      await notifyCronFailure("shotgun", response).catch(() => {});
    }

    // Check Laylo webhook silence (piggyback on daily shotgun cron)
    await checkLayloSilence().catch(() => {});

    return NextResponse.json(response);
  } catch (err) {
    // Shotgun token expired — send specific alert (once)
    if (err instanceof ShotgunAuthError) {
      const alreadyAlerted = await getShotgunTokenAlerted().catch(() => false);
      if (!alreadyAlerted) {
        await notifyTokenExpired("Shotgun").catch(() => {});
        await setShotgunTokenAlerted().catch(() => {});
      }
      return NextResponse.json(
        { ok: false, error: "shotgun_token_expired" },
        { status: 500 }
      );
    }

    const message = err instanceof Error ? err.message : String(err);
    await notifyCronFailure("shotgun", { error: message }).catch(() => {});
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
