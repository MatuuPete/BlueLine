// Per-user token bucket for /api routes (spec §8): 60 requests per minute.
// Upstash Redis (REST, shared across serverless instances) when UPSTASH_REDIS_REST_URL and
// UPSTASH_REDIS_REST_TOKEN are set; otherwise an in-memory Map (dev, single instance).

export const RATE_LIMIT = { capacity: 60, refillPerMinute: 60 } as const;

export type TakeResult = { ok: true } | { ok: false; retryAfter: number };

export interface RateLimiter {
  /** Spend one token from `key`'s bucket. */
  take(key: string): Promise<TakeResult>;
}

interface BucketOptions {
  capacity?: number;
  refillPerMinute?: number;
}

/** In-memory bucket cap: bounds memory between sweeps (least recently used goes first). */
export const MAX_MEMORY_KEYS = 10_000;

const MINUTE_MS = 60_000;

/** Whole seconds until `tokens` grows back to 1 (at least 1). */
function retryAfterSeconds(tokens: number, refillPerMinute: number): number {
  const ms = ((1 - tokens) * MINUTE_MS) / refillPerMinute;
  return Math.max(1, Math.ceil(ms / 1000 - 1e-9));
}

export function createMemoryLimiter(
  opts: BucketOptions & { maxKeys?: number } = {},
): RateLimiter & { size(): number; keys(): string[] } {
  const capacity = opts.capacity ?? RATE_LIMIT.capacity;
  const maxKeys = opts.maxKeys ?? MAX_MEMORY_KEYS;
  const refill = opts.refillPerMinute ?? RATE_LIMIT.refillPerMinute;
  const buckets = new Map<string, { tokens: number; at: number }>();
  let lastSweep = Date.now();

  const level = (b: { tokens: number; at: number }, now: number) =>
    Math.min(capacity, b.tokens + ((now - b.at) * refill) / MINUTE_MS);

  /** Once a minute, forget buckets that have refilled completely (they equal a new bucket). */
  function sweep(now: number) {
    if (now - lastSweep < MINUTE_MS) return;
    lastSweep = now;
    for (const [key, b] of buckets) if (level(b, now) >= capacity) buckets.delete(key);
  }

  /** Store `key` as the most recently used entry (Map order = least to most recent). */
  function put(key: string, tokens: number, at: number) {
    buckets.delete(key);
    while (buckets.size >= maxKeys) {
      const oldest = buckets.keys().next().value;
      if (oldest === undefined) break;
      buckets.delete(oldest);
    }
    buckets.set(key, { tokens, at });
  }

  return {
    async take(key) {
      const now = Date.now();
      sweep(now);
      const b = buckets.get(key);
      const tokens = b ? level(b, now) : capacity;
      if (tokens >= 1) {
        put(key, tokens - 1, now);
        return { ok: true };
      }
      put(key, tokens, now);
      return { ok: false, retryAfter: retryAfterSeconds(tokens, refill) };
    },
    size: () => buckets.size,
    keys: () => [...buckets.keys()],
  };
}

// Atomic refill-and-take. Returns {allowed (0|1), tokens as a string} (Lua numbers would be
// truncated to integers in the reply). The key expires once the bucket would be full again.
const TOKEN_BUCKET_LUA = `
local cap = tonumber(ARGV[1])
local rate = tonumber(ARGV[2])
local now = tonumber(ARGV[3])
local b = redis.call('HMGET', KEYS[1], 't', 'at')
local tokens = tonumber(b[1])
local at = tonumber(b[2])
if tokens == nil or at == nil then tokens = cap; at = now end
tokens = math.min(cap, tokens + math.max(0, now - at) * rate)
local allowed = 0
if tokens >= 1 then tokens = tokens - 1; allowed = 1 end
redis.call('HSET', KEYS[1], 't', tostring(tokens), 'at', tostring(now))
redis.call('PEXPIRE', KEYS[1], math.ceil(cap / rate))
return {allowed, tostring(tokens)}
`.trim();

export function createUpstashLimiter(
  opts: { url: string; token: string } & BucketOptions,
): RateLimiter {
  const capacity = opts.capacity ?? RATE_LIMIT.capacity;
  const refill = opts.refillPerMinute ?? RATE_LIMIT.refillPerMinute;
  const endpoint = opts.url.replace(/\/+$/, '');
  const fallback = createMemoryLimiter({ capacity, refillPerMinute: refill });
  let warned = false;

  return {
    async take(key) {
      try {
        const res = await fetch(endpoint, {
          method: 'POST',
          headers: { Authorization: `Bearer ${opts.token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify([
            'EVAL',
            TOKEN_BUCKET_LUA,
            '1',
            `blueline:rl:${key}`,
            String(capacity),
            String(refill / MINUTE_MS),
            String(Date.now()),
          ]),
          cache: 'no-store',
        });
        if (!res.ok) throw new Error(`Upstash answered ${res.status}`);
        const body = (await res.json()) as { result?: unknown };
        const [allowed, tokens] = Array.isArray(body.result) ? body.result : [];
        if (allowed === 1) return { ok: true };
        if (allowed === 0) {
          return { ok: false, retryAfter: retryAfterSeconds(Number(tokens) || 0, refill) };
        }
        throw new Error('Unexpected Upstash reply');
      } catch (err) {
        // Keep limiting (per instance) rather than failing open or taking the API down.
        if (!warned) {
          warned = true;
          console.error('[rate-limit] Upstash unavailable, using in-memory buckets', err);
        }
        return fallback.take(key);
      }
    },
  };
}

let shared: RateLimiter | undefined;

/** The process-wide limiter, chosen from the environment on first use. */
export function getRateLimiter(): RateLimiter {
  if (!shared) {
    const url = process.env.UPSTASH_REDIS_REST_URL?.trim();
    const token = process.env.UPSTASH_REDIS_REST_TOKEN?.trim();
    shared = url && token ? createUpstashLimiter({ url, token }) : createMemoryLimiter();
  }
  return shared;
}

/**
 * Client IP for signed-out callers. Only `x-real-ip` is trusted: Vercel's edge sets it and
 * overwrites any client-sent value. `x-forwarded-for` is ignored because a client can prepend
 * any address to it (one bucket per forged IP would defeat the limit). Behind another proxy,
 * make it set x-real-ip; without the header every signed-out caller shares one bucket.
 */
export function clientIp(req: Request | undefined): string {
  return req?.headers.get('x-real-ip')?.trim() || 'unknown';
}

export function rateLimitResponse(retryAfter: number): Response {
  return Response.json(
    { error: 'rate_limited' },
    { status: 429, headers: { 'Cache-Control': 'no-store', 'Retry-After': String(retryAfter) } },
  );
}
