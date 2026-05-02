import { NextRequest, NextResponse } from "next/server";
import { processShotgunTickets } from "@/lib/processShotgun";
import {
  getShotgunLastAfter,
  setShotgunLastAfter,
  redisConfigured,
} from "@/lib/state";
import { bearerMatches } from "@/lib/auth";
import { notifyCronFailure } from "@/lib/notify";

export const runtime = "nodejs";
export const maxDuration = 300;

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

  if (result.nextCursor) {
    await setShotgunLastAfter(result.nextCursor);
  }

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

  if (result.failed > 0) {
    await notifyCronFailure("shotgun", response).catch(() => {});
  }

  return NextResponse.json(response);

  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await notifyCronFailure("shotgun", { error: message }).catch(() => {});
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
