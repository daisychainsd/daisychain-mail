import { NextRequest, NextResponse } from "next/server";
import { extractEmailFromUnknown } from "@/lib/extractEmail";
import { subscribeWithSource } from "@/lib/subscribe";

export const runtime = "nodejs";

function verifyLaylo(request: NextRequest): boolean {
  const secret = process.env.LAYLO_WEBHOOK_SECRET;
  if (!secret) return false;
  const header = request.headers.get("x-webhook-secret");
  if (header === secret) return true;
  const auth = request.headers.get("authorization");
  return auth === `Bearer ${secret}`;
}

export async function POST(request: NextRequest) {
  if (!verifyLaylo(request)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const raw = extractEmailFromUnknown(body);
  if (!raw) {
    return NextResponse.json(
      { error: "no_email", hint: "Expected email on payload or nested user/data" },
      { status: 400 }
    );
  }

  const sub = await subscribeWithSource(raw, "laylo");
  if (!sub.ok) {
    return NextResponse.json(
      { ok: false, reason: sub.reason },
      { status: 502 }
    );
  }

  return NextResponse.json({ ok: true });
}
