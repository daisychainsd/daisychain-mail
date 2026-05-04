import { Redis } from "@upstash/redis";

const KEY_BANDCAMP_LAST_END = "bandcamp:last_end_time_utc";
const KEY_SHOTGUN_LAST_AFTER = "shotgun:last_after";
const KEY_LAYLO_LAST_WEBHOOK = "laylo:last_webhook_at";
const KEY_LAYLO_SILENCE_ALERTED = "laylo:silence_alerted";
const KEY_SHOTGUN_TOKEN_ALERTED = "shotgun:token_expired_alerted";

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

export async function setLayloLastWebhook(): Promise<void> {
  const r = getRedis();
  if (!r) return;
  try {
    await r.set(KEY_LAYLO_LAST_WEBHOOK, new Date().toISOString());
    await r.del(KEY_LAYLO_SILENCE_ALERTED);
  } catch {
    // ignore
  }
}

export async function getLayloLastWebhook(): Promise<string | null> {
  const r = getRedis();
  if (!r) return null;
  try {
    return (await r.get<string>(KEY_LAYLO_LAST_WEBHOOK)) ?? null;
  } catch {
    return null;
  }
}

export async function getLayloSilenceAlerted(): Promise<boolean> {
  const r = getRedis();
  if (!r) return false;
  try {
    return (await r.get<string>(KEY_LAYLO_SILENCE_ALERTED)) === "1";
  } catch {
    return false;
  }
}

export async function setLayloSilenceAlerted(): Promise<void> {
  const r = getRedis();
  if (!r) return;
  try {
    await r.set(KEY_LAYLO_SILENCE_ALERTED, "1");
  } catch {
    // ignore
  }
}

export async function getShotgunTokenAlerted(): Promise<boolean> {
  const r = getRedis();
  if (!r) return false;
  try {
    return (await r.get<string>(KEY_SHOTGUN_TOKEN_ALERTED)) === "1";
  } catch {
    return false;
  }
}

export async function setShotgunTokenAlerted(): Promise<void> {
  const r = getRedis();
  if (!r) return;
  try {
    await r.set(KEY_SHOTGUN_TOKEN_ALERTED, "1");
  } catch {
    // ignore
  }
}

export function redisConfigured(): boolean {
  return Boolean(
    process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN
  );
}
