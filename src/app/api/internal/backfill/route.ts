import { NextRequest, NextResponse } from "next/server";
import { getBandcampAccessToken } from "@/lib/bandcampAuth";
import { formatBandcampUtcTime } from "@/lib/bandcamp";
import { processBandcampSalesWindow } from "@/lib/processBandcamp";
import { setBandcampLastEndTime, redisConfigured } from "@/lib/state";
import { bearerMatches } from "@/lib/auth";

export const runtime = "nodejs";
export const maxDuration = 300;

function parseBandId(raw: string | undefined): number | null {
  if (!raw) return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

type Body = {
  start_time?: string;
  end_time?: string;
  advance_cursor?: boolean;
};

export async function POST(request: NextRequest) {
  if (!bearerMatches(request, process.env.INTERNAL_SECRET)) {
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

  let body: Body = {};
  try {
    const text = await request.text();
    if (text) body = JSON.parse(text) as Body;
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const startStr =
    body.start_time ??
    process.env.BANDCAMP_INITIAL_START_TIME ??
    "2000-01-01 00:00:00";
  const endStr =
    body.end_time ?? formatBandcampUtcTime(new Date());

  if (startStr >= endStr) {
    return NextResponse.json(
      { error: "start_time must be before end_time", startStr, endStr },
      { status: 400 }
    );
  }

  const advance = body.advance_cursor !== false;

  const result = await processBandcampSalesWindow(
    token,
    bandId,
    memberBandId,
    startStr,
    endStr
  );

  if (advance) {
    await setBandcampLastEndTime(endStr);
  }

  return NextResponse.json({
    ok: true,
    window: { start_time: startStr, end_time: endStr },
    advance_cursor: advance,
    lineItems: result.lineItems,
    subscribed: result.subscribed,
    skippedNoEmail: result.skippedNoEmail,
    failed: result.failed,
    errors: result.errors,
    redisConfigured: redisConfigured(),
  });
}
