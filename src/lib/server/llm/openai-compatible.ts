import type { LlmCompletionInput, LlmProvider } from './types';

type Options = {
	apiKey: string;
	baseUrl: string;
	model: string;
	jsonObject: boolean;
};

/**
 * OpenAI-style chat completions (`POST .../chat/completions`).
 * Works with Groq, OpenAI, and other compatible hosts via `LLM_BASE_URL`.
 */
export function createOpenAiCompatibleProvider(options: Options): LlmProvider {
	const base = options.baseUrl.replace(/\/$/, '');

	return {
		async complete(input: LlmCompletionInput): Promise<string> {
			const body: Record<string, unknown> = {
				model: options.model,
				messages: input.messages,
				temperature: 0.25
			};
			if (input.jsonObject && options.jsonObject) {
				body.response_format = { type: 'json_object' };
			}

			const res = await fetch(`${base}/chat/completions`, {
				method: 'POST',
				headers: {
					Authorization: `Bearer ${options.apiKey}`,
					'Content-Type': 'application/json'
				},
				body: JSON.stringify(body)
			});

			const text = await res.text();
			if (!res.ok) {
				throw new Error(`LLM HTTP ${res.status}: ${text.slice(0, 400)}`);
			}

			let data: unknown;
			try {
				data = JSON.parse(text);
			} catch {
				throw new Error('LLM returned non-JSON body');
			}

			const choices = (data as { choices?: unknown }).choices;
			const first = Array.isArray(choices) ? choices[0] : undefined;
			const message =
				first && typeof first === 'object' && first !== null
					? (first as { message?: unknown }).message
					: undefined;
			const content =
				message && typeof message === 'object' && message !== null
					? (message as { content?: unknown }).content
					: undefined;

			if (typeof content !== 'string' || !content.trim()) {
				throw new Error('LLM response missing message content');
			}

			return content;
		}
	};
}
