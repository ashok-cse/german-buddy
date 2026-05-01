import { SvelteKitAuth } from '@auth/sveltekit';
import Google from '@auth/sveltekit/providers/google';
import { env as privateEnv } from '$env/dynamic/private';
import { env as publicEnv } from '$env/dynamic/public';

function googleProvider() {
	const id = (publicEnv.PUBLIC_GOOGLE_CLIENT_ID ?? '').trim();
	const clientSecret = (privateEnv.GOOGLE_CLIENT_SECRET ?? '').trim();
	if (!id || !clientSecret) return null;
	return Google({ clientId: id, clientSecret });
}

/**
 * Auth.js for SvelteKit. Set `AUTH_SECRET` (32+ random chars), `PUBLIC_GOOGLE_CLIENT_ID`,
 * and `GOOGLE_CLIENT_SECRET`. Google Cloud Console → Authorized redirect URI:
 * `{origin}/auth/callback/google` (e.g. `http://localhost:5173/auth/callback/google`).
 */
export const { handle, signIn, signOut } = SvelteKitAuth(async () => {
	const g = googleProvider();
	const secret = (privateEnv.AUTH_SECRET ?? '').trim();
	return {
		providers: g ? [g] : [],
		// Fallback avoids crashes during local partial setup; replace with a real secret via AUTH_SECRET.
		secret: secret || 'dev-placeholder-auth-secret-min-32-characters!',
		trustHost: true,
		events: {
			async signIn({ user }) {
				const email = user.email?.trim();
				if (!email) return;

				const {
					pocketbaseConfigured,
					getPocketBaseAdmin,
					ensurePeoplesForOAuthUser
				} = await import('$lib/server/pocketbase');

				if (!pocketbaseConfigured()) {
					console.warn('[pocketbase] peoples sync skipped (missing POCKETBASE_* env)');
					return;
				}

				try {
					const pb = await getPocketBaseAdmin();
					await ensurePeoplesForOAuthUser(pb, { email, name: user.name });
				} catch (err) {
					console.error('[pocketbase] peoples sync failed', err);
				}
			}
		}
	};
});
