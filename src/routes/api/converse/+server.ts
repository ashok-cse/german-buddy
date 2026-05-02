import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { createDefaultLlmProvider } from '$lib/server/llm/factory';
import { runGermanConversationTurn } from '$lib/server/converse-german';
import {
	CONVERSATION_STYLES,
	GERMAN_LEVELS,
	type ConversationMessage,
	type ConversationStyle,
	type GermanLevel,
	type TutorDrillMode
} from '$lib/conversation';

function isConversationMessage(v: unknown): v is ConversationMessage {
	if (!v || typeof v !== 'object') return false;
	const role = (v as { role?: unknown }).role;
	const content = (v as { content?: unknown }).content;
	return (role === 'user' || role === 'assistant') && typeof content === 'string';
}

function readLevel(v: unknown): GermanLevel {
	return typeof v === 'string' && (GERMAN_LEVELS as readonly string[]).includes(v)
		? (v as GermanLevel)
		: 'A2';
}

function readStyle(v: unknown): ConversationStyle {
	return typeof v === 'string' && (CONVERSATION_STYLES as readonly string[]).includes(v)
		? (v as ConversationStyle)
		: 'roleplay';
}

function readTutorDrill(v: unknown): TutorDrillMode | undefined {
	return v === 'words' || v === 'phrases' ? v : undefined;
}

const MAX_AVOID_WORDS = 500;
const MAX_AVOID_TOKEN_LEN = 96;

function readAvoidGermanTargets(v: unknown): string[] | undefined {
	if (!Array.isArray(v)) return undefined;
	const out: string[] = [];
	for (const item of v) {
		if (typeof item !== 'string') continue;
		const t = item.trim();
		if (!t || t.length > MAX_AVOID_TOKEN_LEN) continue;
		out.push(t);
		if (out.length >= MAX_AVOID_WORDS) break;
	}
	return out.length > 0 ? out : undefined;
}

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

	const obj = body as {
		messages?: unknown;
		level?: unknown;
		scenario?: unknown;
		style?: unknown;
		tutorDrill?: unknown;
		avoidGermanTargets?: unknown;
	};

	const level = readLevel(obj.level);
	const style = readStyle(obj.style);
	const tutorDrill = style === 'tutor' ? readTutorDrill(obj.tutorDrill) : undefined;
	const avoidGermanTargets =
		style === 'tutor' && tutorDrill === 'words' ? readAvoidGermanTargets(obj.avoidGermanTargets) : undefined;
	const scenario = typeof obj.scenario === 'string' ? obj.scenario.trim() : '';

	const rawMessages = obj.messages;
	const messages: ConversationMessage[] = Array.isArray(rawMessages)
		? rawMessages
				.filter(isConversationMessage)
				.map((m) => ({ role: m.role, content: m.content.trim() }))
				.filter((m) => m.content)
		: [];

	const lastN = messages.slice(-16);

	const provider = createDefaultLlmProvider();
	if (!provider) {
		throw error(503, 'LLM is not configured (set GROQ_API_KEY or LLM_API_KEY)');
	}

	try {
		const result = await runGermanConversationTurn(provider, {
			level,
			style,
			scenario: scenario || undefined,
			tutorDrill,
			avoidGermanTargets,
			history: lastN
		});
		return json(result);
	} catch (e) {
		const message = e instanceof Error ? e.message : 'Conversation failed';
		if (message.startsWith('LLM HTTP') || message.includes('LLM')) {
			throw error(502, message);
		}
		throw error(500, message);
	}
};
