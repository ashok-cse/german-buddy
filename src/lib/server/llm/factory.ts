import { env } from '$env/dynamic/private';
import { createOpenAiCompatibleProvider } from './openai-compatible';
import type { LlmProvider } from './types';

function readEnv(name: string): string | undefined {
	const v = env[name];
	return typeof v === 'string' && v.trim() ? v.trim() : undefined;
}

const GROQ_BASE = 'https://api.groq.com/openai/v1';
/** Default chat model on Groq; override with `LLM_MODEL` (see Groq model list). */
const GROQ_DEFAULT_MODEL = 'llama-3.3-70b-versatile';

/**
 * Builds the default LLM provider from environment variables.
 * Defaults target [Groq](https://console.groq.com) (OpenAI-compatible). Set `LLM_BASE_URL` for OpenAI or other hosts.
 */
export function createDefaultLlmProvider(): LlmProvider | null {
	const apiKey = readEnv('LLM_API_KEY') ?? readEnv('GROQ_API_KEY');
	if (!apiKey) return null;

	const baseUrl = readEnv('LLM_BASE_URL') ?? GROQ_BASE;
	const model = readEnv('LLM_MODEL') ?? GROQ_DEFAULT_MODEL;
	const jsonObject = (readEnv('LLM_JSON_OBJECT') ?? 'true').toLowerCase() !== 'false';

	return createOpenAiCompatibleProvider({ apiKey, baseUrl, model, jsonObject });
}
