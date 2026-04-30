import { GERMAN_LEVELS, type GermanLevel } from './conversation';

const STORAGE_KEY = 'german-mirror-level-v1';
export const DEFAULT_LEVEL: GermanLevel = 'A2';

export function loadLevel(): GermanLevel {
	if (typeof localStorage === 'undefined') return DEFAULT_LEVEL;
	try {
		const v = localStorage.getItem(STORAGE_KEY);
		return (GERMAN_LEVELS as readonly string[]).includes(v ?? '')
			? (v as GermanLevel)
			: DEFAULT_LEVEL;
	} catch {
		return DEFAULT_LEVEL;
	}
}

export function saveLevel(level: GermanLevel): void {
	if (typeof localStorage === 'undefined') return;
	try {
		localStorage.setItem(STORAGE_KEY, level);
	} catch {
		/* ignore quota / private mode */
	}
}
