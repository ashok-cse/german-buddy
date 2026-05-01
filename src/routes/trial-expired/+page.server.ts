import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import {
	pocketbaseConfigured,
	getPocketBaseAdmin,
	getPeoplesByEmail,
	ensurePeoplesForOAuthUser,
	isTrialActive
} from '$lib/server/pocketbase';

export const load: PageServerLoad = async (event) => {
	const session = await event.locals.auth();
	if (!session?.user?.email) {
		throw redirect(303, '/login?next=/trial-expired');
	}
	if (!pocketbaseConfigured()) {
		return {};
	}
	try {
		const pb = await getPocketBaseAdmin();
		let record = await getPeoplesByEmail(pb, session.user.email);
		if (!record) {
			record = await ensurePeoplesForOAuthUser(pb, {
				email: session.user.email,
				name: session.user.name
			});
		}
		if (isTrialActive(record)) {
			throw redirect(303, '/app');
		}
	} catch (e) {
		if (e && typeof e === 'object' && 'status' in e && (e as { status: number }).status === 303) {
			throw e;
		}
	}
	return {};
};
