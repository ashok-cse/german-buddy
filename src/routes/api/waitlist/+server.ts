import { error, json, type RequestHandler } from '@sveltejs/kit';
import { promises as fs } from 'node:fs';
import path from 'node:path';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
/**
 * Path of the JSONL signup log. Override via `WAITLIST_FILE` env var; defaults
 * to `<cwd>/data/waitlist.jsonl` (which is `/app/data/waitlist.jsonl` in the
 * production image, declared as a Docker `VOLUME` so EasyPanel can mount a
 * persistent volume at that path).
 */
const WAITLIST_FILE = process.env.WAITLIST_FILE
	? path.resolve(process.env.WAITLIST_FILE)
	: path.resolve('data', 'waitlist.jsonl');

export const POST: RequestHandler = async ({ request, getClientAddress }) => {
	let body: unknown;
	try {
		body = await request.json();
	} catch {
		throw error(400, 'Invalid JSON body');
	}

	const raw = (body as { email?: unknown })?.email;
	const email = typeof raw === 'string' ? raw.trim().toLowerCase() : '';
	if (!email || email.length > 254 || !EMAIL_RE.test(email)) {
		throw error(400, 'Please enter a valid email address.');
	}

	const entry = {
		email,
		ts: new Date().toISOString(),
		ip: getClientAddress?.() ?? null
	};

	// Best-effort persistence: never fail the request if the disk isn't writable.
	try {
		await fs.mkdir(path.dirname(WAITLIST_FILE), { recursive: true });
		await fs.appendFile(WAITLIST_FILE, JSON.stringify(entry) + '\n', 'utf8');
	} catch (e) {
		console.warn('[waitlist] persist failed:', e);
	}
	console.log('[waitlist] signup', entry);

	return json({ ok: true });
};
