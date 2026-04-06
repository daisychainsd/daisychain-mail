import { Redis } from "@upstash/redis";

const KEY_BANDCAMP_LAST_END = "bandcamp:last_end_time_utc";
const KEY_SHOTGUN_LAST_AFTER = "shotgun:last_after";

let client: Redis | null = null;

function getRedis(): Redis | null {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  if (!client) client = new Redis({ url, token });
  return client;
}

export async function getBandcampLastEndTime(): Promise<string | null> {
  const r = getRedis();
  if (!r) return null;
  try {
    const v = await r.get<string>(KEY_BANDCAMP_LAST_END);
    return v ?? null;
  } catch {
    return null;
  }
}

export async function setBandcampLastEndTime(isoUtc: string): Promise<void> {
  const r = getRedis();
  if (!r) return;
  try {
    await r.set(KEY_BANDCAMP_LAST_END, isoUtc);
  } catch {
    // ignore if Redis unavailable
  }
}

export async function getShotgunLastAfter(): Promise<string | null> {
  const r = getRedis();
  if (!r) return null;
  try {
    const v = await r.get<string>(KEY_SHOTGUN_LAST_AFTER);
    return v ?? null;
  } catch {
    return null;
  }
}

export async function setShotgunLastAfter(cursor: string): Promise<void> {
  const r = getRedis();
  if (!r) return;
  try {
    await r.set(KEY_SHOTGUN_LAST_AFTER, cursor);
  } catch {
    // ignore if Redis unavailable
  }
}

export function redisConfigured(): boolean {
  return Boolean(
    process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN
  );
}
