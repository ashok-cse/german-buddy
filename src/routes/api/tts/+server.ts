import { error } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import type { RequestHandler } from './$types';

const PIPER_URL = env.PIPER_TTS_URL || 'http://127.0.0.1:5000';
/** Hard cap so a runaway prompt can't tie the synthesizer up. */
const MAX_TEXT_LENGTH = 600;
/** Piper synthesis is ~RTF 0.1 on CPU; 15s covers the longest realistic line plus jitter. */
const PIPER_TIMEOUT_MS = 15_000;

export const POST: RequestHandler = async ({ request }) => {
	let body: unknown;
	try {
		body = await request.json();
	} catch {
		throw error(400, 'Invalid JSON body');
	}

	const text =
		body && typeof body === 'object' && typeof (body as { text?: unknown }).text === 'string'
			? ((body as { text: string }).text).trim()
			: '';

	if (!text) throw error(400, 'text is required');
	if (text.length > MAX_TEXT_LENGTH) throw error(413, 'text too long');

	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), PIPER_TIMEOUT_MS);

	let piperRes: Response;
	try {
		piperRes = await fetch(PIPER_URL, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ text }),
			signal: controller.signal
		});
	} catch (e) {
		const reason = e instanceof Error ? e.message : 'unknown';
		throw error(503, `piper unreachable: ${reason}`);
	} finally {
		clearTimeout(timer);
	}

	if (!piperRes.ok) {
		throw error(502, `piper error ${piperRes.status}`);
	}

	const buf = await piperRes.arrayBuffer();
	if (buf.byteLength === 0) throw error(502, 'piper returned empty audio');

	return new Response(buf, {
		status: 200,
		headers: {
			'Content-Type': 'audio/wav',
			'Content-Length': String(buf.byteLength),
			'Cache-Control': 'no-store'
		}
	});
};
