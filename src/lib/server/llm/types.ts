export type ChatMessage = {
	role: 'system' | 'user' | 'assistant';
	content: string;
};

export type LlmCompletionInput = {
	messages: ChatMessage[];
	/** When true, request JSON object mode (OpenAI-compatible). */
	jsonObject?: boolean;
};

export interface LlmProvider {
	complete(input: LlmCompletionInput): Promise<string>;
}
