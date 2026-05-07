export type VocabCard = {
	id: number;
	day: number;
	week: number;
	phase: string;
	type: string;
	theme: string;
	german: string;
	ipa: string;
	english: string;
	useCase: string;
};

/** Fisher–Yates shuffle (mutates copy). */
export function shuffleInPlace<T>(arr: T[]): T[] {
	for (let i = arr.length - 1; i > 0; i--) {
		const j = Math.floor(Math.random() * (i + 1));
		[arr[i], arr[j]] = [arr[j], arr[i]];
	}
	return arr;
}

export function clampDay(day: number, totalDays: number): number {
	if (!Number.isFinite(day)) return 1;
	const d = Math.floor(day);
	if (d < 1) return 1;
	if (d > totalDays) return totalDays;
	return d;
}
