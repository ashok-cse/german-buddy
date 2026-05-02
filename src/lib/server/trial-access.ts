import { env } from '$env/dynamic/private';
import {
	pocketbaseConfigured,
	getPocketBaseAdmin,
	getPeoplesByEmail,
	isTrialActive
} from '$lib/server/pocketbase';

export type TrialDenyReason =
	| 'no_email'
	| 'trial_ended'
	| 'no_profile'
	| 'pb_unavailable'
	| 'pb_not_configured';

export type TrialGateResult = { allowed: true } | { allowed: false; reason: TrialDenyReason };

/** When true (set in production), trial-gated routes deny access if PocketBase env is missing. */
export function pocketbaseRequiredForTrial(): boolean {
	return (env.POCKETBASE_REQUIRED ?? '').trim().toLowerCase() === 'true';
}

/**
 * Trial gate for /app and LLM-backed APIs.
 * - Fail-closed on PocketBase errors when PB is configured.
 * - Does **not** create `peoples` rows (avoids trial reset / duplicate trials); creation stays in OAuth `signIn` only.
 * - If `POCKETBASE_REQUIRED=true` and env is incomplete → deny (`pb_not_configured`).
 * - If PocketBase is optional (dev) and not configured → allow without trial metadata.
 */
export async function checkTrialAccessForUser(options: {
	email: string | null | undefined;
}): Promise<TrialGateResult> {
	if (!options.email?.trim()) {
		return { allowed: false, reason: 'no_email' };
	}

	if (!pocketbaseConfigured()) {
		if (pocketbaseRequiredForTrial()) {
			return { allowed: false, reason: 'pb_not_configured' };
		}
		return { allowed: true };
	}

	try {
		const pb = await getPocketBaseAdmin();
		const record = await getPeoplesByEmail(pb, options.email);
		if (!record) {
			return { allowed: false, reason: 'no_profile' };
		}
		if (isTrialActive(record)) {
			return { allowed: true };
		}
		return { allowed: false, reason: 'trial_ended' };
	} catch (err) {
		console.error('[trial] PocketBase access check failed', err);
		return { allowed: false, reason: 'pb_unavailable' };
	}
}

/** Routes that require an active trial (same surface as the practice app). */
export function requiresTrialGate(pathname: string): boolean {
	if (pathname === '/app' || pathname.startsWith('/app/')) return true;
	if (
		pathname.startsWith('/api/correct') ||
		pathname.startsWith('/api/converse') ||
		pathname.startsWith('/api/tts') ||
		pathname.startsWith('/api/transcribe')
	) {
		return true;
	}
	return false;
}
