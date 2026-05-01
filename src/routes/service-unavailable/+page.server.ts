import type { PageServerLoad } from './$types';

const COPY: Record<
	string,
	{ title: string; detail: string }
> = {
	pb: {
		title: 'Trial verification unavailable',
		detail:
			'We could not reach our profile service. Please try again in a few minutes. If this continues, contact support.'
	},
	config: {
		title: 'Server configuration error',
		detail:
			'Trial enforcement requires PocketBase environment variables on this deployment. Ask the administrator to set POCKETBASE_URL, POCKETBASE_ADMIN_EMAIL, and POCKETBASE_ADMIN_PASSWORD (or disable strict mode only for development).'
	},
	profile: {
		title: 'Profile not ready yet',
		detail:
			'Your account profile has not synced yet. Wait a few seconds and refresh, or sign out and sign in with Google again.'
	}
};

export const load: PageServerLoad = async ({ url }) => {
	const reason = url.searchParams.get('reason') ?? '';
	const entry =
		reason === 'config' ? COPY.config : reason === 'profile' ? COPY.profile : COPY.pb;
	return {
		title: entry.title,
		detail: entry.detail
	};
};
