import { NextRequest, NextResponse } from "next/server";
import { createHmac, timingSafeEqual } from "crypto";
import { extractEmailFromUnknown } from "@/lib/extractEmail";
import { subscribeWithSource } from "@/lib/subscribe";

export const runtime = "nodejs";

function verifyLaylo(timestamp: string, rawBody: string, signature: string): boolean {
  const secret = process.env.LAYLO_WEBHOOK_SECRET;
  if (!secret) return false;
  const expected = createHmac("sha256", secret)
    .update(timestamp + rawBody)
    .digest("base64");
  try {
    return timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
  } catch {
    return false;
  }
}

export async function POST(request: NextRequest) {
  const timestamp = request.headers.get("x-laylo-timestamp");
  const signature = request.headers.get("x-signature-256");
  const rawBody = await request.text();

  // Debug: log incoming headers and computed signature (remove after debugging)
  const secret = process.env.LAYLO_WEBHOOK_SECRET;
  if (secret) {
    const computedBase64 = createHmac("sha256", secret).update((timestamp ?? "") + rawBody).digest("base64");
    const computedHex    = createHmac("sha256", secret).update((timestamp ?? "") + rawBody).digest("hex");
    const computedBodyOnly = createHmac("sha256", secret).update(rawBody).digest("base64");
    console.log("[laylo-debug] timestamp header:", timestamp);
    console.log("[laylo-debug] received signature:", signature);
    console.log("[laylo-debug] computed base64 (ts+body):", computedBase64);
    console.log("[laylo-debug] computed hex    (ts+body):", computedHex);
    console.log("[laylo-debug] computed base64 (body only):", computedBodyOnly);
    console.log("[laylo-debug] body:", rawBody.slice(0, 200));
  }

  if (!timestamp || !signature || !verifyLaylo(timestamp, rawBody, signature)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = JSON.parse(rawBody);
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
    return NextResponse.json({ ok: false, reason: sub.reason }, { status: 502 });
  }

  return NextResponse.json({ ok: true });
}
