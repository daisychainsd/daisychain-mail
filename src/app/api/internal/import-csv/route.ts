import { NextRequest, NextResponse } from "next/server";
import { normalizeEmail } from "@/lib/normalize";
import { subscribeWithSource } from "@/lib/subscribe";
import { bearerMatches } from "@/lib/auth";

export const runtime = "nodejs";
export const maxDuration = 300;

function parseEmailsFromCsv(text: string): string[] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length === 0) return [];

  const first = lines[0].toLowerCase();
  const hasHeader = first.includes("email");
  const start = hasHeader ? 1 : 0;

  const emails: string[] = [];
  for (let i = start; i < lines.length; i++) {
    const line = lines[i];
    const cell = line.includes(",") ? line.split(",")[0].trim() : line.trim();
    const email = normalizeEmail(cell.replace(/^"|"$/g, ""));
    if (email) emails.push(email);
  }
  return emails;
}

export async function POST(request: NextRequest) {
  if (!bearerMatches(request, process.env.INTERNAL_SECRET)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const source =
    request.headers.get("x-source") || request.nextUrl.searchParams.get("source") || "import";

  const text = await request.text();
  if (!text.trim()) {
    return NextResponse.json({ error: "empty_body" }, { status: 400 });
  }

  const emails = parseEmailsFromCsv(text);
  let subscribed = 0;
  let failed = 0;
  const errors: string[] = [];

  for (const email of emails) {
    const sub = await subscribeWithSource(email, source);
    if (sub.ok) subscribed += 1;
    else {
      failed += 1;
      if (errors.length < 20) errors.push(`${email}: ${sub.reason}`);
    }
  }

  return NextResponse.json({
    ok: true,
    source,
    totalRows: emails.length,
    subscribed,
    failed,
    errors,
  });
}
