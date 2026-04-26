import type { Handle } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';

/**
 * Routes behind HTTP Basic auth. The landing page (`/`) and `/api/waitlist`
 * stay public so anyone can sign up; everything else (the practice app and the
 * LLM-backed APIs it calls) requires `APP_USERNAME` / `APP_PASSWORD` from env.
 */
const PROTECTED_PREFIXES = ['/app', '/dashboard', '/api/correct', '/api/converse'];

function isProtected(pathname: string): boolean {
	return PROTECTED_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

/** Constant-time string compare to avoid timing leaks on credential check. */
function timingSafeEqual(a: string, b: string): boolean {
	if (a.length !== b.length) return false;
	let mismatch = 0;
	for (let i = 0; i < a.length; i++) mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
	return mismatch === 0;
}

let warnedUnprotected = false;

export const handle: Handle = async ({ event, resolve }) => {
	if (!isProtected(event.url.pathname)) return resolve(event);

	const username = env.APP_USERNAME;
	const password = env.APP_PASSWORD;

	if (!username || !password) {
		if (!warnedUnprotected) {
			console.warn(
				'[auth] APP_USERNAME / APP_PASSWORD are not set — /app and its APIs are UNPROTECTED.'
			);
			warnedUnprotected = true;
		}
		return resolve(event);
	}

	const header = event.request.headers.get('authorization') ?? '';
	if (header.toLowerCase().startsWith('basic ')) {
		try {
			const decoded = Buffer.from(header.slice(6).trim(), 'base64').toString('utf-8');
			const sep = decoded.indexOf(':');
			if (sep > 0) {
				const u = decoded.slice(0, sep);
				const p = decoded.slice(sep + 1);
				if (timingSafeEqual(u, username) && timingSafeEqual(p, password)) {
					return resolve(event);
				}
			}
		} catch {
			// fall through to 401
		}
	}

	return new Response('Authentication required.', {
		status: 401,
		headers: {
			'WWW-Authenticate': 'Basic realm="German Buddy", charset="UTF-8"',
			'Content-Type': 'text/plain; charset=utf-8'
		}
	});
};
