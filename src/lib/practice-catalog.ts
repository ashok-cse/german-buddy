import { PRACTICE_PROMPTS } from './prompts';

export type PracticeCategoryId = 'daily' | 'numbers' | 'alphabet';

export type PracticeItem = {
	readonly id: string;
	/** Task in German (sent to the correction API as the practice prompt). */
	readonly prompt: string;
	/** Optional model line: listen for pronunciation or compare when writing. */
	readonly learnText?: string;
};

export const PRACTICE_CATEGORY_ORDER = ['daily', 'numbers', 'alphabet'] as const satisfies readonly PracticeCategoryId[];

export const PRACTICE_CATEGORY_LABELS: Record<PracticeCategoryId, string> = {
	daily: 'Daily life',
	numbers: 'Numbers',
	alphabet: 'Alphabet'
};

export const PRACTICE_CATEGORY_HINTS: Record<PracticeCategoryId, string> = {
	daily: 'Short real-life situations — same prompts work in writing or speaking.',
	numbers: 'Counting, prices, and digits — practice saying and spelling numbers.',
	alphabet: 'Letters and spelling — practice clear German letter names.'
};

const DAILY_ITEMS: readonly PracticeItem[] = PRACTICE_PROMPTS.map((prompt, i) => ({
	id: `daily-${i}`,
	prompt
}));

const NUMBERS_ITEMS: readonly PracticeItem[] = [
	{
		id: 'n-1',
		prompt: 'Zähle laut von eins bis zehn auf Deutsch.',
		learnText: 'eins, zwei, drei, vier, fünf, sechs, sieben, acht, neun, zehn'
	},
	{
		id: 'n-2',
		prompt: 'Zähle laut von elf bis zwanzig auf Deutsch.',
		learnText: 'elf, zwölf, dreizehn, vierzehn, fünfzehn, sechzehn, siebzehn, achtzehn, neunzehn, zwanzig'
	},
	{
		id: 'n-3',
		prompt: 'Sage die Zehnerzahlen von zwanzig bis hundert (zwanzig, dreißig, vierzig …).',
		learnText:
			'zwanzig, dreißig, vierzig, fünfzig, sechzig, siebzig, achtzig, neunzig, hundert'
	},
	{
		id: 'n-4',
		prompt: 'Sage diese Zahlen als Wörter auf Deutsch: 2, 5, 12, 21, 45, 99.',
		learnText: 'zwei, fünf, zwölf, einundzwanzig, fünfundvierzig, neunundneunzig'
	},
	{
		id: 'n-5',
		prompt: 'Sage drei erfundene Preise in Euro (z. B. „drei Euro fünfzig“ oder „zwölf Euro zehn“).',
		learnText: 'Beispiel: drei Euro fünfzig, zwölf Euro zehn, neunundzwanzig Euro neunundneunzig'
	},
	{
		id: 'n-6',
		prompt: 'Sage die Zahlen 100, 200, 500 und 1000 als Wörter.',
		learnText: 'hundert, zweihundert, fünfhundert, eintausend'
	},
	{
		id: 'n-7',
		prompt: 'Zähle rückwärts von zehn bis eins auf Deutsch.',
		learnText: 'zehn, neun, acht, sieben, sechs, fünf, vier, drei, zwei, eins'
	},
	{
		id: 'n-8',
		prompt: 'Sage deine (erfundene) Telefonnummer Ziffer für Ziffer auf Deutsch.',
		learnText: 'Beispiel: null, eins, sieben, sechs … (Ziffern einzeln nennen)'
	}
];

const ALPHABET_ITEMS: readonly PracticeItem[] = [
	{
		id: 'a-1',
		prompt: 'Sage das deutsche Alphabet von A bis Z und nenne am Ende Ä, Ö, Ü und Eszett (ß).',
		learnText:
			'A, B, C, D, E, F, G, H, I, J, K, L, M, N, O, P, Q, R, S, T, U, V, W, X, Y, Z, Ä, Ö, Ü, Eszett'
	},
	{
		id: 'a-2',
		prompt: 'Buchstabiere deinen Vornamen langsam auf Deutsch (Buchstabe für Buchstabe).',
		learnText: 'z. B.: A wie Anton, N wie Nordpol, N wie Nordpol, A wie Anton'
	},
	{
		id: 'a-3',
		prompt: 'Buchstabiere das Wort „Berlin“ auf Deutsch.',
		learnText: 'B, E, R, L, I, N'
	},
	{
		id: 'a-4',
		prompt: 'Buchstabiere das Wort „Schule“ auf Deutsch — achte auf S, C, H.',
		learnText: 'S, C, H, U, L, E'
	},
	{
		id: 'a-5',
		prompt: 'Sage die Buchstabenfolge D, F, M, S, V laut und deutlich (wie beim Buchstabieren).',
		learnText: 'D, F, M, S, V'
	},
	{
		id: 'a-6',
		prompt: 'Nenne die Umlaute und sage je ein kurzes Wort damit: ä, ö, ü.',
		learnText: 'z. B.: ä wie Äpfel, ö wie Öl, ü wie Übermut'
	}
];

const BY_CATEGORY: Record<PracticeCategoryId, readonly PracticeItem[]> = {
	daily: DAILY_ITEMS,
	numbers: NUMBERS_ITEMS,
	alphabet: ALPHABET_ITEMS
};

export function getPracticeItems(category: PracticeCategoryId): readonly PracticeItem[] {
	return BY_CATEGORY[category];
}

export function randomItemIndex(category: PracticeCategoryId, exclude?: number): number {
	const items = getPracticeItems(category);
	if (items.length <= 1) return 0;
	let idx = 0;
	for (let i = 0; i < 24; i++) {
		idx = Math.floor(Math.random() * items.length);
		if (idx !== exclude) break;
	}
	return idx;
}
