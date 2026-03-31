export function normalizeEmail(raw: string | undefined | null): string | null {
  if (raw == null || typeof raw !== "string") return null;
  const trimmed = raw.trim().toLowerCase();
  if (!trimmed || !trimmed.includes("@")) return null;
  return trimmed;
}
