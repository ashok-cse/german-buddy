/** Shared by client + server: normalize German targets for deduplication. */
export function normalizeWordPlayKey(raw: string): string {
	return raw.trim().replace(/\s+/g, ' ').toLowerCase();
}

export const WORD_PLAY_BANK_STORAGE_KEY = 'german_mirror_word_play_bank_v1';
/** Room for long-term practice toward 300+ distinct items; FIFO trim on save. */
export const WORD_PLAY_BANK_MAX = 450;

export function extractGermanTargetFromAssistantContent(content: string): string | null {
	const m = content.match(/→\s*([^\n]+)/);
	if (!m) return null;
	const t = normalizeWordPlayKey(m[1]);
	return t || null;
}

export type ChatLikeMessage = { role: string; content: string };

export function extractGermanTargetsFromHistory(messages: ChatLikeMessage[]): string[] {
	const out: string[] = [];
	for (const m of messages) {
		if (m.role !== 'assistant') continue;
		const t = extractGermanTargetFromAssistantContent(m.content);
		if (t) out.push(t);
	}
	return out;
}

/** Dedupe while preserving order (first occurrence wins). */
export function mergeAvoidWordLists(...lists: string[][]): string[] {
	const seen = new Set<string>();
	const out: string[] = [];
	for (const list of lists) {
		for (const raw of list) {
			const k = normalizeWordPlayKey(raw);
			if (!k || seen.has(k)) continue;
			seen.add(k);
			out.push(k);
		}
	}
	return out;
}

/** Append if new; trim oldest when over max (FIFO). */
export function appendWordPlayBank(current: readonly string[], germanTarget: string): string[] {
	const k = normalizeWordPlayKey(germanTarget);
	if (!k) return [...current];
	if (current.includes(k)) return [...current];
	const next = [...current, k];
	return next.length > WORD_PLAY_BANK_MAX ? next.slice(-WORD_PLAY_BANK_MAX) : next;
}

export function loadWordPlayBankFromStorage(): string[] {
	if (typeof localStorage === 'undefined') return [];
	try {
		const raw = localStorage.getItem(WORD_PLAY_BANK_STORAGE_KEY);
		if (!raw) return [];
		const j: unknown = JSON.parse(raw);
		if (!Array.isArray(j)) return [];
		const out: string[] = [];
		const seen = new Set<string>();
		for (const item of j) {
			if (typeof item !== 'string') continue;
			const k = normalizeWordPlayKey(item);
			if (!k || seen.has(k)) continue;
			seen.add(k);
			out.push(k);
		}
		return out.length > WORD_PLAY_BANK_MAX ? out.slice(-WORD_PLAY_BANK_MAX) : out;
	} catch {
		return [];
	}
}

export function saveWordPlayBankToStorage(words: readonly string[]): void {
	if (typeof localStorage === 'undefined') return;
	try {
		localStorage.setItem(WORD_PLAY_BANK_STORAGE_KEY, JSON.stringify([...words]));
	} catch {
		/* quota / private mode */
	}
}

/** Lowercase keys only — use with mergeAvoidWordLists output. */
export function forbiddenWordPlaySet(words: readonly string[]): Set<string> {
	return new Set(words.map((w) => normalizeWordPlayKey(w)).filter(Boolean));
}

export function isForbiddenWordPlayTarget(
	target: string | undefined,
	forbidden: Set<string>
): boolean {
	if (!target?.trim()) return false;
	const k = normalizeWordPlayKey(target);
	return k.length > 0 && forbidden.has(k);
}

/** Fold umlauts for forgiving STT vs expected German (compare only). */
function foldGermanSpeechKey(s: string): string {
	return normalizeWordPlayKey(s)
		.replace(/ä/g, 'a')
		.replace(/ö/g, 'o')
		.replace(/ü/g, 'u')
		.replace(/ß/g, 'ss');
}

/** Groq/Web Speech often drops umlauts — treat Tür vs tur as match when lengths align. */
export function speechRoughlyMatchesGermanTarget(expected: string, heard: string): boolean {
	const e = normalizeWordPlayKey(expected);
	const h = normalizeWordPlayKey(heard);
	if (!e || !h) return false;
	if (e === h) return true;
	if (h.includes(e) || e.includes(h)) return true;
	return foldGermanSpeechKey(expected) === foldGermanSpeechKey(heard);
}
