function stripCodeFences(text: string): string {
	return text
		.trim()
		.replace(/^```(?:json)?\s*/i, '')
		.replace(/\s*```$/i, '')
		.trim();
}

function tryParseObject(raw: string): Record<string, unknown> | null {
	const cleaned = stripCodeFences(raw);
	try {
		const parsed: unknown = JSON.parse(cleaned);
		if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
			return parsed as Record<string, unknown>;
		}
	} catch {
		const match = cleaned.match(/\{[\s\S]*\}/);
		if (match) {
			try {
				const parsed: unknown = JSON.parse(match[0]);
				if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
					return parsed as Record<string, unknown>;
				}
			} catch {
				return null;
			}
		}
	}
	return null;
}

function readString(obj: Record<string, unknown>, key: string): string | undefined {
	const v = obj[key];
	if (typeof v !== 'string') return undefined;
	const t = v.trim();
	return t ? t : undefined;
}

export type ParsedWordCorrection = { wrong: string; right: string; note?: string };

export type ParsedConversation = {
	assistant: string;
	germanTarget?: string;
	correctedUser?: string;
	corrections?: ParsedWordCorrection[];
	explanation?: string;
	pronunciation?: string;
};

function readCorrections(obj: Record<string, unknown>): ParsedWordCorrection[] | undefined {
	const raw = obj.corrections ?? obj.fixes ?? obj.diffs;
	if (!Array.isArray(raw)) return undefined;
	const out: ParsedWordCorrection[] = [];
	for (const item of raw) {
		if (!item || typeof item !== 'object') continue;
		const rec = item as Record<string, unknown>;
		const wrong =
			(typeof rec.wrong === 'string' && rec.wrong.trim()) ||
			(typeof rec.from === 'string' && rec.from.trim()) ||
			'';
		const right =
			(typeof rec.right === 'string' && rec.right.trim()) ||
			(typeof rec.correct === 'string' && rec.correct.trim()) ||
			(typeof rec.to === 'string' && rec.to.trim()) ||
			'';
		if (!wrong || !right || wrong === right) continue;
		const note =
			typeof rec.note === 'string' && rec.note.trim()
				? rec.note.trim()
				: typeof rec.reason === 'string' && rec.reason.trim()
					? rec.reason.trim()
					: undefined;
		out.push({ wrong, right, note });
	}
	return out.length > 0 ? out : undefined;
}

export function parseConversationResponse(raw: string): ParsedConversation {
	const obj = tryParseObject(raw);
	if (!obj) {
		return {
			assistant:
				'Entschuldigung — das hat nicht geklappt. Versuch’s bitte noch einmal mit einem kürzeren Satz.',
			explanation: 'I could not parse the answer. Please try a shorter sentence.'
		};
	}

	const assistant = readString(obj, 'assistant') ?? readString(obj, 'reply') ?? '';
	const germanTarget =
		readString(obj, 'germanTarget') ??
		readString(obj, 'german_target') ??
		readString(obj, 'target');
	const correctedUser = readString(obj, 'correctedUser') ?? readString(obj, 'corrected_user');
	const corrections = readCorrections(obj);
	const explanation =
		readString(obj, 'explanation') ?? readString(obj, 'correction') ?? readString(obj, 'tip');
	const pronunciation = readString(obj, 'pronunciation') ?? readString(obj, 'pronounce');

	if (!assistant) {
		return {
			assistant: 'Sorry — I did not get a reply. Try a shorter sentence and we will build on it.',
			germanTarget,
			correctedUser,
			corrections,
			explanation: explanation ?? 'Try a short sentence to begin.'
		};
	}

	return { assistant, germanTarget, correctedUser, corrections, explanation, pronunciation };
}

