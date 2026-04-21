import type { CorrectionResult } from '$lib/correction';

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

function readString(obj: Record<string, unknown>, key: string): string {
	const v = obj[key];
	return typeof v === 'string' ? v.trim() : '';
}

/**
 * Parses and normalises model output. Missing fields are filled from the user's text
 * so the client can always render five cards.
 */
export function parseCorrectionResponse(raw: string, userOriginal: string): CorrectionResult {
	const obj = tryParseObject(raw);
	const fallbackTip =
		'Die KI-Antwort war unklar. Bitte erneut versuchen oder den Text etwas kürzen.';

	if (!obj) {
		return {
			original: userOriginal,
			corrected: userOriginal,
			natural: userOriginal,
			english: 'Translation unavailable.',
			tip: fallbackTip
		};
	}

	const original = readString(obj, 'original') || userOriginal;
	const corrected = readString(obj, 'corrected') || original;
	const natural = readString(obj, 'natural') || corrected;
	const english = readString(obj, 'english') || 'Translation unavailable.';
	const tip = readString(obj, 'tip') || 'Kurz weiter üben — kleine Sätze helfen am Anfang.';

	return { original, corrected, natural, english, tip };
}
