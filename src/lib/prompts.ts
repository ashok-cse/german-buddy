/** Fifteen practical German practice prompts for daily life in Germany. */
export const PRACTICE_PROMPTS: readonly string[] = [
	'Stell dich kurz vor: Wer bist du, woher kommst du und was machst du beruflich oder im Studium?',
	'Beschreibe in 3–5 Sätzen, wo du wohnst und was dir an deinem Viertel gefällt oder nicht gefällt.',
	'Erkläre, was du studierst oder welchen Beruf du lernst, und warum du dich dafür interessierst.',
	'Erzähle auf Deutsch, was du heute gemacht hast — auch kleine Dinge wie Essen, Lernen oder Spazierengehen.',
	'Du sitzt im Restaurant: Bestelle höflich ein Hauptgericht, ein Getränk und bitte um die Rechnung.',
	'Du bist an der Supermarktkasse: Sage kurz, dass du eine Tüte brauchst, und frage, ob du mit Karte zahlen kannst.',
	'Du bist in einer fremden Stadt: Bitte einen Passanten um Wegweisung zu einem nahegelegenen Bahnhof.',
	'Du telefonierst mit einer Hausverwaltung: Stelle zwei konkrete Fragen zur Wohnung (z. B. Kaltmiete, Nebenkosten, Besichtigung).',
	'Beschreibe leicht verständlich deine Symptome in der Apotheke und bitte um ein rezeptfreies Mittel.',
	'Du bist an der Uni: Frage an der Infotheke nach Prüfungsterminen oder nach einem bestimmten Seminarraum.',
	'Stell dich in 4–6 Sätzen für ein Vorstellungsgespräch vor — Fähigkeiten, Erfahrung und was du suchst.',
	'Beschreibe ein Projekt, an dem du gearbeitet hast: Ziel, deine Rolle und ein Ergebnis.',
	'Erkläre in einfachen Sätzen, warum du Deutsch lernst und wie du übst.',
	'Beschreibe deinen typischen Wochentag: Aufstehen, Uni/Arbeit, Freizeit, Schlafenszeit.',
	'Was hast du am Wochenende vor? Erwähne Pläne, Leute und vielleicht das Wetter.'
] as const;

export function randomPromptIndex(exclude?: number): number {
	if (PRACTICE_PROMPTS.length <= 1) return 0;
	let idx = 0;
	for (let i = 0; i < 24; i++) {
		idx = Math.floor(Math.random() * PRACTICE_PROMPTS.length);
		if (idx !== exclude) break;
	}
	return idx;
}
