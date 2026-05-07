import type { PageServerLoad } from './$types';
import vocab from '$lib/data/vocab-german-4000.json';
import type { VocabCard } from '$lib/vocab-deck';
import { clampDay } from '$lib/vocab-deck';

const ALL = vocab as VocabCard[];
const TOTAL_DAYS = 90;

export const load: PageServerLoad = async ({ url }) => {
	const raw = Number(url.searchParams.get('day'));
	const day = clampDay(raw, TOTAL_DAYS);
	const cards = ALL.filter((c) => c.day === day);
	return { day, cards, totalDays: TOTAL_DAYS };
};
