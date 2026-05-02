import { redirect, type Handle } from '@sveltejs/kit';
import { sequence } from '@sveltejs/kit/hooks';
import { handle as authenticationHandle } from './auth';
import { authConfigured } from '$lib/server/auth';
import {
	checkTrialAccessForUser,
	requiresTrialGate,
	type TrialDenyReason
} from '$lib/server/trial-access';
import { matchRateLimitRule, takeRateLimit } from '$lib/server/rate-limit';

/**
 * Routes behind login. The landing page (`/`), auth routes (`/auth/*`), login/logout,
 * and `/api/waitlist` stay public; the practice app and LLM-backed APIs require a session.
 */
const PROTECTED_PREFIXES = [
	'/app',
	'/dashboard',
	'/api/correct',
	'/api/converse',
	'/api/tts',
	'/api/transcribe'
];

function isProtected(pathname: string): boolean {
	return PROTECTED_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

let warnedUnconfigured = false;

const rateLimitHandle: Handle = async ({ event, resolve }) => {
	const rule = matchRateLimitRule(event.url.pathname);
	if (!rule) return resolve(event);

	const ip = event.getClientAddress?.() ?? 'unknown';
	const result = takeRateLimit(`${rule.name}:${ip}`, rule.max);
	if (!result.ok) {
		return new Response(JSON.stringify({ message: 'Too many requests' }), {
			status: 429,
			headers: {
				'content-type': 'application/json; charset=utf-8',
				'Retry-After': String(result.retryAfterSeconds)
			}
		});
	}
	return resolve(event);
};

function trialDeniedApiResponse(reason: TrialDenyReason): Response {
	const json = (status: number, body: Record<string, unknown>) =>
		new Response(JSON.stringify(body), {
			status,
			headers: { 'content-type': 'application/json; charset=utf-8' }
		});

	switch (reason) {
		case 'trial_ended':
			return json(403, { message: 'Trial expired', code: 'TRIAL_EXPIRED' });
		case 'no_email':
			return json(401, { message: 'Unauthorized', code: 'NO_EMAIL' });
		case 'no_profile':
			return json(503, {
				message: 'Profile not ready. Wait a moment or sign in again.',
				code: 'PROFILE_MISSING'
			});
		case 'pb_unavailable':
			return json(503, {
				message: 'Trial verification unavailable. Try again later.',
				code: 'PB_UNAVAILABLE'
			});
		case 'pb_not_configured':
			return json(503, {
				message: 'Trial enforcement is not configured on this server.',
				code: 'PB_NOT_CONFIGURED'
			});
	}
}

function trialDeniedRedirect(reason: TrialDenyReason): never {
	switch (reason) {
		case 'trial_ended':
			throw redirect(303, '/trial-expired');
		case 'no_email':
			throw redirect(303, '/login');
		case 'no_profile':
			throw redirect(303, '/service-unavailable?reason=profile');
		case 'pb_unavailable':
			throw redirect(303, '/service-unavailable?reason=pb');
		case 'pb_not_configured':
			throw redirect(303, '/service-unavailable?reason=config');
	}
}

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
			email: session.user.email
		});

		if (!trial.allowed) {
			if (event.url.pathname.startsWith('/api/')) {
				return trialDeniedApiResponse(trial.reason);
			}
			trialDeniedRedirect(trial.reason);
		}
	}

	return resolve(event);
};

export const handle = sequence(authenticationHandle, rateLimitHandle, authorizationHandle);
