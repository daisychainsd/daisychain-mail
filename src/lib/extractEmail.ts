export function extractEmailFromUnknown(body: unknown): string | null {
  if (body == null) return null;

  if (typeof body === "string") return body;

  if (typeof body !== "object") return null;
  const o = body as Record<string, unknown>;

  if (typeof o.email === "string") return o.email;

  if (o.user && typeof o.user === "object") {
    const u = o.user as Record<string, unknown>;
    if (typeof u.email === "string") return u.email;
  }

  if (o.data && typeof o.data === "object") {
    const d = o.data as Record<string, unknown>;
    if (typeof d.email === "string") return d.email;
    if (d.user && typeof d.user === "object") {
      const u = d.user as Record<string, unknown>;
      if (typeof u.email === "string") return u.email;
    }
  }

  if (o.fan && typeof o.fan === "object") {
    const f = o.fan as Record<string, unknown>;
    if (typeof f.email === "string") return f.email;
  }

  return null;
}
