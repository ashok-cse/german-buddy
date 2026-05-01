import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { authConfigured } from '$lib/server/auth';

const SAFE_NEXT = /^\/(?!login\b|logout\b)[A-Za-z0-9/_\-?=&.]*$/;

function safeNext(raw: string | null | undefined): string {
	if (!raw) return '/app';
	return SAFE_NEXT.test(raw) ? raw : '/app';
}

export const load: PageServerLoad = async ({ url, locals }) => {
	const session = await locals.auth();
	if (session?.user) {
		throw redirect(303, safeNext(url.searchParams.get('next')));
	}
	return { configured: authConfigured() };
};
