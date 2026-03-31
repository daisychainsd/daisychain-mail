import type { NextRequest } from "next/server";

export function bearerMatches(request: NextRequest, secret: string | undefined): boolean {
  if (!secret) return false;
  const auth = request.headers.get("authorization");
  return auth === `Bearer ${secret}`;
}
