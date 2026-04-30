import type { Handle } from '@sveltejs/kit';
import { SESSION_COOKIE, authConfigured, isAuthenticated } from '$lib/server/auth';

/**
 * Routes behind login. The landing page (`/`), the login/logout endpoints, and
 * `/api/waitlist` stay public; everything else (the practice app and the
 * LLM-backed APIs it calls) requires a valid session cookie set by `/login`.
 */
const PROTECTED_PREFIXES = ['/app', '/dashboard', '/api/correct', '/api/converse', '/api/tts'];

function isProtected(pathname: string): boolean {
	return PROTECTED_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

let warnedUnconfigured = false;

export const handle: Handle = async ({ event, resolve }) => {
	if (!isProtected(event.url.pathname)) return resolve(event);

	if (!authConfigured()) {
		if (!warnedUnconfigured) {
			console.error(
				'[auth] APP_USERNAME / APP_PASSWORD are not set — protected routes are blocked. Set both in .env to grant access.'
			);
			warnedUnconfigured = true;
		}
	}

	const token = event.cookies.get(SESSION_COOKIE);
	if (isAuthenticated(token)) return resolve(event);

	// API consumers expect JSON, not an HTML redirect.
	if (event.url.pathname.startsWith('/api/')) {
		return new Response(JSON.stringify({ message: 'Unauthorized' }), {
			status: 401,
			headers: { 'content-type': 'application/json; charset=utf-8' }
		});
	}

	const next = event.url.pathname + event.url.search;
	return new Response(null, {
		status: 303,
		headers: { Location: `/login?next=${encodeURIComponent(next)}` }
	});
};
