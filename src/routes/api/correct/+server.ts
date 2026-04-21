import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { createDefaultLlmProvider } from '$lib/server/llm/factory';
import { runGermanCorrection } from '$lib/server/correct-german';

export const POST: RequestHandler = async ({ request }) => {
	let body: unknown;
	try {
		body = await request.json();
	} catch {
		throw error(400, 'Invalid JSON body');
	}

	if (!body || typeof body !== 'object') {
		throw error(400, 'Expected JSON object');
	}

	const prompt = typeof (body as { prompt?: unknown }).prompt === 'string'
		? (body as { prompt: string }).prompt.trim()
		: '';
	const answer = typeof (body as { answer?: unknown }).answer === 'string'
		? (body as { answer: string }).answer.trim()
		: '';

	if (!prompt) throw error(400, 'Missing prompt');
	if (!answer) throw error(400, 'Missing answer');

	const provider = createDefaultLlmProvider();
	if (!provider) {
		throw error(503, 'LLM is not configured (set GROQ_API_KEY or LLM_API_KEY)');
	}

	try {
		const result = await runGermanCorrection(provider, prompt, answer);
		return json(result);
	} catch (e) {
		const message = e instanceof Error ? e.message : 'Correction failed';
		if (message.startsWith('LLM HTTP') || message.includes('LLM')) {
			throw error(502, message);
		}
		throw error(500, message);
	}
};
