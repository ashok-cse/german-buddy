import {
	pocketbaseConfigured,
	getPocketBaseAdmin,
	getPeoplesByEmail,
	ensurePeoplesForOAuthUser,
	isTrialActive
} from '$lib/server/pocketbase';

export type TrialGateResult =
	| { allowed: true }
	| { allowed: false; reason: 'no_email' | 'trial_ended' };

/**
 * Trial gate for /app and LLM-backed APIs. When PocketBase is not configured, allows access (local dev).
 * On PocketBase errors, allows access and logs so outages do not hard-lock the product.
 */
export async function checkTrialAccessForUser(options: {
	email: string | null | undefined;
	name?: string | null;
}): Promise<TrialGateResult> {
	if (!options.email?.trim()) {
		return { allowed: false, reason: 'no_email' };
	}
	if (!pocketbaseConfigured()) {
		return { allowed: true };
	}
	try {
		const pb = await getPocketBaseAdmin();
		let record = await getPeoplesByEmail(pb, options.email);
		if (!record) {
			record = await ensurePeoplesForOAuthUser(pb, {
				email: options.email,
				name: options.name
			});
		}
		if (isTrialActive(record)) {
			return { allowed: true };
		}
		return { allowed: false, reason: 'trial_ended' };
	} catch (err) {
		console.error('[trial] PocketBase access check failed', err);
		return { allowed: true };
	}
}

/** Routes that require an active trial (same surface as the practice app). */
export function requiresTrialGate(pathname: string): boolean {
	if (pathname === '/app' || pathname.startsWith('/app/')) return true;
	if (
		pathname.startsWith('/api/correct') ||
		pathname.startsWith('/api/converse') ||
		pathname.startsWith('/api/tts')
	) {
		return true;
	}
	return false;
}
