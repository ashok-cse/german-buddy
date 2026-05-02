import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { groqSpeechApiKey } from '$lib/server/groq-speech';

const GROQ_TRANSCRIBE_URL = 'https://api.groq.com/openai/v1/audio/transcriptions';
/** Groq-hosted Whisper — fast German STT (same family as large-v3; not the HF `primeline/…` checkpoint). */
const WHISPER_MODEL = 'whisper-large-v3';
const MAX_BYTES = 24 * 1024 * 1024;
const TIMEOUT_MS = 45_000;

export const GET: RequestHandler = async () => {
	return json({ available: !!groqSpeechApiKey() });
};

export const POST: RequestHandler = async ({ request }) => {
	const apiKey = groqSpeechApiKey();
	if (!apiKey) {
		throw error(503, 'Speech transcription is not configured (set GROQ_API_KEY or use Groq for LLM)');
	}

	const ct = request.headers.get('content-type') ?? '';
	if (!ct.includes('multipart/form-data')) {
		throw error(400, 'Expected multipart/form-data');
	}

	let form: FormData;
	try {
		form = await request.formData();
	} catch {
		throw error(400, 'Invalid multipart body');
	}

	const file = form.get('audio');
	if (!(file instanceof File) || file.size === 0) {
		throw error(400, 'audio file is required');
	}
	if (file.size > MAX_BYTES) {
		throw error(413, 'audio too large');
	}

	const language = typeof form.get('language') === 'string' ? String(form.get('language')).trim() : 'de';

	const upstream = new FormData();
	upstream.append('file', file, file.name || 'audio.webm');
	upstream.append('model', WHISPER_MODEL);
	upstream.append('language', language || 'de');
	upstream.append('response_format', 'json');

	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

	let res: Response;
	try {
		res = await fetch(GROQ_TRANSCRIBE_URL, {
			method: 'POST',
			headers: { Authorization: `Bearer ${apiKey}` },
			body: upstream,
			signal: controller.signal
		});
	} catch (e) {
		const msg = e instanceof Error ? e.message : 'unknown';
		throw error(502, `transcription upstream: ${msg}`);
	} finally {
		clearTimeout(timer);
	}

	const rawText = await res.text();
	if (!res.ok) {
		throw error(502, rawText.slice(0, 300) || `transcription error ${res.status}`);
	}

	let text = '';
	try {
		const j = JSON.parse(rawText) as { text?: unknown };
		text = typeof j?.text === 'string' ? j.text.trim() : '';
	} catch {
		throw error(502, 'invalid transcription response');
	}

	return json({ text });
};
