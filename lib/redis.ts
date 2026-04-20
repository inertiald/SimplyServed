import Redis from "ioredis";

const globalForRedis = globalThis as unknown as {
  redisPub?: Redis;
  redisSub?: Redis;
};

const redisUrl = process.env.REDIS_URL ?? "redis://localhost:6379";

/**
 * Lazily-instantiated Redis publisher. Used for pub/sub fan-out from server
 * actions. Falls back gracefully (no-op) when Redis is unavailable so dev
 * environments without compose still work.
 */
function makeClient(): Redis {
  const client = new Redis(redisUrl, {
    lazyConnect: true,
    maxRetriesPerRequest: 1,
    enableOfflineQueue: false,
    retryStrategy: (times) => Math.min(times * 200, 3000),
  });
  client.on("error", (err) => {
    // Swallow connection errors — they shouldn't crash the Next.js process.
    if (process.env.NODE_ENV !== "production") {
      console.warn("[redis] not connected:", err.message);
    }
  });
  return client;
}

export function getPublisher(): Redis {
  if (!globalForRedis.redisPub) {
    globalForRedis.redisPub = makeClient();
  }
  return globalForRedis.redisPub;
}

export function getSubscriber(): Redis {
  if (!globalForRedis.redisSub) {
    globalForRedis.redisSub = makeClient();
  }
  return globalForRedis.redisSub;
}

/** Best-effort publish — never throws. */
export async function safePublish(channel: string, payload: unknown): Promise<void> {
  try {
    const pub = getPublisher();
    if (pub.status === "wait" || pub.status === "end") {
      await pub.connect().catch(() => undefined);
    }
    if (pub.status === "ready") {
      await pub.publish(channel, JSON.stringify(payload));
    }
  } catch {
    // ignore — pub/sub is best-effort.
  }
}
