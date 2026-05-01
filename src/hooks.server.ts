import { redirect, type Handle } from '@sveltejs/kit';
import { sequence } from '@sveltejs/kit/hooks';
import { handle as authenticationHandle } from './auth';
import { authConfigured } from '$lib/server/auth';
import { checkTrialAccessForUser, requiresTrialGate } from '$lib/server/trial-access';

/**
 * Routes behind login. The landing page (`/`), auth routes (`/auth/*`), login/logout,
 * and `/api/waitlist` stay public; the practice app and LLM-backed APIs require a session.
 */
const PROTECTED_PREFIXES = ['/app', '/dashboard', '/api/correct', '/api/converse', '/api/tts'];

function isProtected(pathname: string): boolean {
	return PROTECTED_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

let warnedUnconfigured = false;

const authorizationHandle: Handle = async ({ event, resolve }) => {
	if (!isProtected(event.url.pathname)) return resolve(event);

	if (!authConfigured()) {
		if (!warnedUnconfigured) {
			console.error(
				'[auth] Set AUTH_SECRET (32+ chars), PUBLIC_GOOGLE_CLIENT_ID, and GOOGLE_CLIENT_SECRET — protected routes stay blocked until then.'
			);
			warnedUnconfigured = true;
		}
	}

	const session = await event.locals.auth();
	if (!session?.user) {
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
	}

	if (requiresTrialGate(event.url.pathname)) {
		const trial = await checkTrialAccessForUser({
			email: session.user.email,
			name: session.user.name
		});

		if (!trial.allowed) {
			if (trial.reason === 'trial_ended') {
				if (event.url.pathname.startsWith('/api/')) {
					return new Response(JSON.stringify({ message: 'Trial expired' }), {
						status: 403,
						headers: { 'content-type': 'application/json; charset=utf-8' }
					});
				}
				throw redirect(303, '/trial-expired');
			}

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
		}
	}

	return resolve(event);
};

export const handle = sequence(authenticationHandle, authorizationHandle);
