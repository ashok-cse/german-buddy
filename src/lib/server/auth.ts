import { env as privateEnv } from '$env/dynamic/private';
import { env as publicEnv } from '$env/dynamic/public';

/** True when Google OAuth + Auth.js secret are configured for real sign-in. */
export function authConfigured(): boolean {
	const id = (publicEnv.PUBLIC_GOOGLE_CLIENT_ID ?? '').trim();
	const googleSecret = (privateEnv.GOOGLE_CLIENT_SECRET ?? '').trim();
	const authSecret = (privateEnv.AUTH_SECRET ?? '').trim();
	return !!(id && googleSecret && authSecret.length >= 32);
}
