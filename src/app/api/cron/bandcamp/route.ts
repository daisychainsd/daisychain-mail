import { NextRequest, NextResponse } from "next/server";
import { getBandcampAccessToken } from "@/lib/bandcampAuth";
import { formatBandcampUtcTime } from "@/lib/bandcamp";
import { processBandcampSalesWindow } from "@/lib/processBandcamp";
import {
  getBandcampLastEndTime,
  setBandcampLastEndTime,
  redisConfigured,
} from "@/lib/state";
import { bearerMatches } from "@/lib/auth";

export const runtime = "nodejs";
export const maxDuration = 300;

function parseBandId(raw: string | undefined): number | null {
  if (!raw) return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

export async function GET(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (!bearerMatches(request, cronSecret)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const bandId = parseBandId(process.env.BANDCAMP_BAND_ID);
  if (bandId == null) {
    return NextResponse.json({ error: "missing BANDCAMP_BAND_ID" }, { status: 500 });
  }

  let token: string;
  try {
    token = await getBandcampAccessToken();
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json(
      { error: "bandcamp_auth_failed", detail: msg },
      { status: 500 }
    );
  }

  const memberBandId = process.env.BANDCAMP_MEMBER_BAND_ID
    ? parseBandId(process.env.BANDCAMP_MEMBER_BAND_ID) ?? undefined
    : undefined;

  const end = new Date();
  const endStr = formatBandcampUtcTime(end);

  const stored = await getBandcampLastEndTime();
  const startStr =
    stored ??
    process.env.BANDCAMP_INITIAL_START_TIME ??
    "2000-01-01 00:00:00";

  if (startStr >= endStr) {
    return NextResponse.json({
      ok: true,
      skipped: true,
      reason: "start_time >= end_time",
      redisConfigured: redisConfigured(),
    });
  }

  const result = await processBandcampSalesWindow(
    token,
    bandId,
    memberBandId,
    startStr,
    endStr
  );

  await setBandcampLastEndTime(endStr);

  return NextResponse.json({
    ok: true,
    window: { start_time: startStr, end_time: endStr },
    lineItems: result.lineItems,
    subscribed: result.subscribed,
    skippedNoEmail: result.skippedNoEmail,
    failed: result.failed,
    errors: result.errors,
    redisConfigured: redisConfigured(),
    warning: redisConfigured()
      ? undefined
      : "Redis not configured: cursor not persisted across deploys; add Upstash Redis from Vercel Marketplace (UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN).",
  });
}
