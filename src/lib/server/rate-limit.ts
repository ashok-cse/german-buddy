/**
 * Fixed-window in-memory rate limiter (per-process). Suitable for a single Node instance;
 * for horizontal scale, use Redis or an edge limiter instead.
 */

type Bucket = { windowStart: number; count: number };

const buckets = new Map<string, Bucket>();

const WINDOW_MS = 60_000;
const MAX_KEYS = 8000;

function pruneIfNeeded(): void {
	if (buckets.size <= MAX_KEYS) return;
	const keys = [...buckets.keys()];
	for (let i = 0; i < keys.length / 2; i++) {
		buckets.delete(keys[i]);
	}
}

export type RateLimitResult = { ok: true } | { ok: false; retryAfterSeconds: number };

/**
 * @param key — e.g. `correct:203.0.113.1`
 * @param max — max requests per window
 */
export function takeRateLimit(key: string, max: number): RateLimitResult {
	const now = Date.now();
	let b = buckets.get(key);
	if (!b || now - b.windowStart >= WINDOW_MS) {
		b = { windowStart: now, count: 1 };
		buckets.set(key, b);
		pruneIfNeeded();
		return { ok: true };
	}
	if (b.count >= max) {
		const retryAfterMs = WINDOW_MS - (now - b.windowStart);
		return {
			ok: false,
			retryAfterSeconds: Math.max(1, Math.ceil(retryAfterMs / 1000))
		};
	}
	b.count++;
	return { ok: true };
}

export type RateLimitRule = { prefix: string; name: string; max: number };

/** Prefix match: first matching rule wins (order matters). */
export const API_RATE_LIMIT_RULES: RateLimitRule[] = [
	{ prefix: '/api/correct', name: 'correct', max: 40 },
	{ prefix: '/api/converse', name: 'converse', max: 30 },
	{ prefix: '/api/tts', name: 'tts', max: 60 },
	{ prefix: '/api/waitlist', name: 'waitlist', max: 15 }
];

export function matchRateLimitRule(pathname: string): RateLimitRule | undefined {
	return API_RATE_LIMIT_RULES.find((r) => pathname === r.prefix || pathname.startsWith(`${r.prefix}/`));
}
