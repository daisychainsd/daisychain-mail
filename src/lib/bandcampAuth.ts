import { Redis } from "@upstash/redis";

const OAUTH_CACHE_KEY = "bandcamp:oauth_bundle";

type OAuthBundle = {
  access_token: string;
  refresh_token?: string;
  expires_at_ms: number;
};

function getRedis(): Redis | null {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  return new Redis({ url, token });
}

async function readBundle(): Promise<OAuthBundle | null> {
  const r = getRedis();
  if (!r) return null;
  try {
    const raw = await r.get<string>(OAUTH_CACHE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as OAuthBundle;
  } catch {
    return null;
  }
}

async function writeBundle(bundle: OAuthBundle): Promise<void> {
  const r = getRedis();
  if (!r) return;
  try {
    const ttlSec = Math.max(
      60,
      Math.floor((bundle.expires_at_ms - Date.now()) / 1000)
    );
    await r.set(OAUTH_CACHE_KEY, JSON.stringify(bundle), { ex: ttlSec });
  } catch {
    // ignore
  }
}

let memoryBundle: OAuthBundle | null = null;

function bundleValid(b: OAuthBundle | null): boolean {
  if (!b?.access_token) return false;
  return Date.now() < b.expires_at_ms - 30_000;
}

async function postToken(body: Record<string, string>): Promise<OAuthBundle> {
  const res = await fetch("https://bandcamp.com/oauth_token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams(body),
  });

  const text = await res.text();
  let data: Record<string, unknown>;
  try {
    data = JSON.parse(text) as Record<string, unknown>;
  } catch {
    throw new Error(`Bandcamp oauth_token: not JSON (${res.status}): ${text.slice(0, 500)}`);
  }

  if (!res.ok) {
    throw new Error(`Bandcamp oauth_token ${res.status}: ${text.slice(0, 800)}`);
  }

  const access_token = data.access_token;
  if (typeof access_token !== "string" || !access_token) {
    throw new Error(`Bandcamp oauth_token: missing access_token in: ${text.slice(0, 500)}`);
  }

  const expires_in =
    typeof data.expires_in === "number" && data.expires_in > 0
      ? data.expires_in
      : 3600;

  const refresh_token =
    typeof data.refresh_token === "string" ? data.refresh_token : undefined;

  const bufferSec = 120;
  const expires_at_ms = Date.now() + expires_in * 1000 - bufferSec * 1000;

  return {
    access_token,
    refresh_token,
    expires_at_ms,
  };
}

async function fetchWithClientCredentials(): Promise<OAuthBundle> {
  const client_id = process.env.BANDCAMP_CLIENT_ID?.trim();
  const client_secret = process.env.BANDCAMP_CLIENT_SECRET?.trim();
  if (!client_id || !client_secret) {
    throw new Error("BANDCAMP_CLIENT_ID and BANDCAMP_CLIENT_SECRET are required");
  }

  return postToken({
    grant_type: "client_credentials",
    client_id,
    client_secret,
  });
}

async function fetchWithRefreshToken(refresh_token: string): Promise<OAuthBundle> {
  const client_id = process.env.BANDCAMP_CLIENT_ID?.trim();
  const client_secret = process.env.BANDCAMP_CLIENT_SECRET?.trim();
  if (!client_id || !client_secret) {
    throw new Error("BANDCAMP_CLIENT_ID and BANDCAMP_CLIENT_SECRET are required");
  }

  return postToken({
    grant_type: "refresh_token",
    refresh_token,
    client_id,
    client_secret,
  });
}

export async function getBandcampAccessToken(): Promise<string> {
  const legacy = process.env.BANDCAMP_ACCESS_TOKEN?.trim();
  const hasOAuthApp =
    Boolean(process.env.BANDCAMP_CLIENT_ID?.trim()) &&
    Boolean(process.env.BANDCAMP_CLIENT_SECRET?.trim());

  if (!hasOAuthApp) {
    if (legacy) return legacy;
    throw new Error(
      "Bandcamp: set BANDCAMP_CLIENT_ID + BANDCAMP_CLIENT_SECRET in Vercel, or BANDCAMP_ACCESS_TOKEN"
    );
  }

  let bundle = await readBundle();
  if (!bundleValid(bundle)) {
    bundle = memoryBundle;
  }

  if (bundleValid(bundle)) {
    return bundle!.access_token;
  }

  if (bundle?.refresh_token) {
    try {
      const refreshed = await fetchWithRefreshToken(bundle.refresh_token);
      memoryBundle = refreshed;
      await writeBundle(refreshed);
      return refreshed.access_token;
    } catch {
      // fall through to client_credentials
    }
  }

  const fresh = await fetchWithClientCredentials();
  memoryBundle = fresh;
  await writeBundle(fresh);
  return fresh.access_token;
}
