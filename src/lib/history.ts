const STORAGE_KEY = 'german-mirror-history-v1';
export const HISTORY_LIMIT = 10;

export type HistoryEntry = {
	prompt: string;
	original: string;
	corrected: string;
	timestamp: number;
};

export function loadHistory(): HistoryEntry[] {
	if (typeof localStorage === 'undefined') return [];
	try {
		const raw = localStorage.getItem(STORAGE_KEY);
		if (!raw) return [];
		const parsed: unknown = JSON.parse(raw);
		if (!Array.isArray(parsed)) return [];
		return parsed
			.filter(
				(row): row is HistoryEntry =>
					!!row &&
					typeof row === 'object' &&
					typeof (row as HistoryEntry).prompt === 'string' &&
					typeof (row as HistoryEntry).original === 'string' &&
					typeof (row as HistoryEntry).corrected === 'string' &&
					typeof (row as HistoryEntry).timestamp === 'number'
			)
			.slice(0, HISTORY_LIMIT);
	} catch {
		return [];
	}
}

export function saveHistory(entries: HistoryEntry[]): void {
	if (typeof localStorage === 'undefined') return;
	try {
		localStorage.setItem(STORAGE_KEY, JSON.stringify(entries.slice(0, HISTORY_LIMIT)));
	} catch {
		/* ignore quota / private mode */
	}
}

export function prependHistory(current: HistoryEntry[], entry: HistoryEntry): HistoryEntry[] {
	return [entry, ...current.filter((e) => e.timestamp !== entry.timestamp)].slice(0, HISTORY_LIMIT);
}
