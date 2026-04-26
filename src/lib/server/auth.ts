import { createHmac, timingSafeEqual } from 'node:crypto';
import { env } from '$env/dynamic/private';

/** Name of the session cookie set after a successful login. */
export const SESSION_COOKIE = 'gb_session';

/**
 * Read the configured username/password from env, trimming surrounding
 * whitespace (a common `.env` paper-cut: `APP_USERNAME= ashok` keeps the
 * leading space and silently breaks every login attempt).
 */
function readCreds(): { username: string; password: string } | null {
	const u = (env.APP_USERNAME ?? '').trim();
	const p = (env.APP_PASSWORD ?? '').trim();
	if (!u || !p) return null;
	return { username: u, password: p };
}

/**
 * Derive the canonical session token from the configured username/password.
 * The cookie value is just this HMAC digest — it never contains the credentials
 * themselves, and rotating either env var instantly invalidates all sessions.
 *
 * Returns `null` when env is not configured, so callers can short-circuit.
 */
export function expectedSessionToken(): string | null {
	const c = readCreds();
	if (!c) return null;
	return createHmac('sha256', `${c.username}:${c.password}`).update('gb-auth:v1').digest('hex');
}

/** Constant-time comparison of two strings of arbitrary length. */
function safeEqualStrings(a: string, b: string): boolean {
	const ab = Buffer.from(a, 'utf8');
	const bb = Buffer.from(b, 'utf8');
	if (ab.length !== bb.length) return false;
	return timingSafeEqual(ab, bb);
}

/** True when the cookie carries a token matching the current env credentials. */
export function isAuthenticated(token: string | undefined | null): boolean {
	if (!token) return false;
	const expected = expectedSessionToken();
	if (!expected) return false;
	return safeEqualStrings(token, expected);
}

/**
 * Validate raw form-submitted credentials against the configured env values.
 * Both fields are length-checked first and then compared in constant time.
 */
export function credsMatch(username: string, password: string): boolean {
	const c = readCreds();
	if (!c) return false;
	return safeEqualStrings(username, c.username) && safeEqualStrings(password, c.password);
}

/** Whether the server is configured for auth at all. */
export function authConfigured(): boolean {
	return readCreds() !== null;
}
