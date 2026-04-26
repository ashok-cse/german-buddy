import { dev } from '$app/environment';
import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import {
	SESSION_COOKIE,
	authConfigured,
	credsMatch,
	expectedSessionToken,
	isAuthenticated
} from '$lib/server/auth';

const SAFE_NEXT = /^\/(?!login\b|logout\b)[A-Za-z0-9/_\-?=&.]*$/;

function safeNext(raw: string | null | undefined): string {
	if (!raw) return '/app';
	return SAFE_NEXT.test(raw) ? raw : '/app';
}

export const load: PageServerLoad = ({ url, cookies }) => {
	if (isAuthenticated(cookies.get(SESSION_COOKIE))) {
		throw redirect(303, safeNext(url.searchParams.get('next')));
	}
	return { configured: authConfigured() };
};

export const actions: Actions = {
	default: async ({ request, cookies, url }) => {
		const form = await request.formData();
		const username = String(form.get('username') ?? '').trim();
		const password = String(form.get('password') ?? '');
		const next = safeNext(url.searchParams.get('next'));

		if (!authConfigured()) {
			return fail(503, {
				username,
				error: 'Authentication is not configured on the server.'
			});
		}

		if (!username || !password) {
			return fail(400, {
				username,
				error: 'Please enter both your username and password.'
			});
		}

		if (!credsMatch(username, password)) {
			return fail(401, {
				username,
				error: 'Incorrect username or password.'
			});
		}

		const token = expectedSessionToken();
		if (!token) {
			return fail(503, {
				username,
				error: 'Authentication is not configured on the server.'
			});
		}

		cookies.set(SESSION_COOKIE, token, {
			path: '/',
			httpOnly: true,
			sameSite: 'lax',
			secure: !dev,
			maxAge: 60 * 60 * 24 * 30
		});

		throw redirect(303, next);
	}
};
