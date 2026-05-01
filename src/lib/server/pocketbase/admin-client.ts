import PocketBase from 'pocketbase';
import { env } from '$env/dynamic/private';

let client: PocketBase | null = null;

/** True when admin URL and credentials are set (used to skip sync without throwing). */
export function pocketbaseConfigured(): boolean {
	const url = (env.POCKETBASE_URL ?? '').trim();
	const email = (env.POCKETBASE_ADMIN_EMAIL ?? '').trim();
	const password = (env.POCKETBASE_ADMIN_PASSWORD ?? '').trim();
	return !!(url && email && password);
}

/**
 * Shared admin-authenticated client for server-side CRUD. Superuser token is kept in memory.
 */
export async function getPocketBaseAdmin(): Promise<PocketBase> {
	if (!pocketbaseConfigured()) {
		throw new Error('PocketBase is not configured (set POCKETBASE_URL, POCKETBASE_ADMIN_EMAIL, POCKETBASE_ADMIN_PASSWORD)');
	}
	const baseUrl = (env.POCKETBASE_URL ?? '').trim().replace(/\/$/, '');
	if (!client) {
		client = new PocketBase(baseUrl);
	}
	if (!client.authStore.isValid) {
		const email = (env.POCKETBASE_ADMIN_EMAIL ?? '').trim();
		const password = (env.POCKETBASE_ADMIN_PASSWORD ?? '').trim();
		await client.admins.authWithPassword(email, password);
	}
	return client;
}
