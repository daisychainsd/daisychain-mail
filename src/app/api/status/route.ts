import { NextRequest, NextResponse } from "next/server";
import {
  getBandcampLastEndTime,
  getShotgunLastAfter,
  getLayloLastWebhook,
  pingRedis,
  redisConfigured,
} from "@/lib/state";
import { bearerMatches } from "@/lib/auth";

export const runtime = "nodejs";

const BEEHIIV_API = "https://api.beehiiv.com/v2";
const BEEHIIV_TIMEOUT_MS = 5000;

type BeehiivStatus = {
  ok: boolean;
  subscriberCount: number | null;
  lastPost: { title: string; publishedAt: string } | null;
};

async function beehiivGet(path: string, apiKey: string): Promise<unknown> {
  const res = await fetch(`${BEEHIIV_API}${path}`, {
    headers: { Authorization: `Bearer ${apiKey}` },
    signal: AbortSignal.timeout(BEEHIIV_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`beehiiv_${res.status}`);
  return res.json();
}

async function checkBeehiiv(): Promise<BeehiivStatus> {
  const apiKey = process.env.BEEHIIV_API_KEY;
  const publicationId = process.env.BEEHIIV_PUBLICATION_ID;
  if (!apiKey || !publicationId) {
    return { ok: false, subscriberCount: null, lastPost: null };
  }

  const [pub, posts] = await Promise.allSettled([
    beehiivGet(`/publications/${publicationId}?expand[]=stats`, apiKey),
    beehiivGet(
      `/publications/${publicationId}/posts?limit=1&status=confirmed&order_by=publish_date&direction=desc`,
      apiKey
    ),
  ]);

  let subscriberCount: number | null = null;
  if (pub.status === "fulfilled") {
    const stats = (pub.value as { data?: { stats?: { active_subscriptions?: number } } })
      .data?.stats;
    subscriberCount =
      typeof stats?.active_subscriptions === "number"
        ? stats.active_subscriptions
        : null;
  }

  let lastPost: BeehiivStatus["lastPost"] = null;
  if (posts.status === "fulfilled") {
    const post = (posts.value as {
      data?: { title?: string; publish_date?: number }[];
    }).data?.[0];
    if (post?.title && post.publish_date) {
      lastPost = {
        title: post.title,
        publishedAt: new Date(post.publish_date * 1000).toISOString(),
      };
    }
  }

  return {
    ok: pub.status === "fulfilled" && posts.status === "fulfilled",
    subscriberCount,
    lastPost,
  };
}

export async function GET(request: NextRequest) {
  if (!bearerMatches(request, process.env.INTERNAL_SECRET)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const [reachable, bandcampLastEndTime, shotgunLastAfter, lastWebhookAt, beehiiv] =
    await Promise.all([
      pingRedis(),
      getBandcampLastEndTime(),
      getShotgunLastAfter(),
      getLayloLastWebhook(),
      checkBeehiiv().catch((): BeehiivStatus => ({
        ok: false,
        subscriberCount: null,
        lastPost: null,
      })),
    ]);

  const daysSince = lastWebhookAt
    ? Math.floor((Date.now() - new Date(lastWebhookAt).getTime()) / 86_400_000)
    : null;

  return NextResponse.json({
    ok: reachable && beehiiv.ok,
    checkedAt: new Date().toISOString(),
    redis: { configured: redisConfigured(), reachable },
    cursors: { bandcampLastEndTime, shotgunLastAfter },
    laylo: { lastWebhookAt, daysSince },
    beehiiv,
  });
}
