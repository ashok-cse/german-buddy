import { env } from '$env/dynamic/private';

function readEnv(name: string): string | undefined {
	const v = env[name];
	return typeof v === 'string' && v.trim() ? v.trim() : undefined;
}

/** Key for Groq-only endpoints (Whisper). Uses `GROQ_API_KEY`, or `LLM_API_KEY` when chat is already on Groq. */
export function groqSpeechApiKey(): string | undefined {
	const g = readEnv('GROQ_API_KEY');
	if (g) return g;
	const base = readEnv('LLM_BASE_URL') ?? '';
	if (base.includes('groq.com')) return readEnv('LLM_API_KEY');
	return undefined;
}
