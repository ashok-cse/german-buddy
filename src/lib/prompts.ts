import type { GermanLevel } from './conversation';

export type LeveledPrompt = {
	readonly level: GermanLevel;
	readonly prompt: string;
};

/** Daily-life practice prompts, tagged by CEFR level. */
export const PRACTICE_PROMPTS: readonly LeveledPrompt[] = [
	{ level: 'A1', prompt: 'Sag, wie du heißt und woher du kommst (2–3 Sätze).' },
	{ level: 'A1', prompt: 'Nenne drei Dinge, die du jeden Tag machst.' },
	{ level: 'A1', prompt: 'Was isst du gern? Sage zwei oder drei Sachen.' },
	{ level: 'A1', prompt: 'Welche Farbe magst du? Sag kurz, warum.' },
	{ level: 'A1', prompt: 'Beschreibe dein Zimmer mit drei einfachen Sätzen.' },
	{ level: 'A1', prompt: 'Wie ist das Wetter heute? Sage es in 2 Sätzen.' },
	{ level: 'A1', prompt: 'Stell deine Familie kurz vor (3 Sätze).' },
	{ level: 'A1', prompt: 'Sag, was du jetzt gerade machst.' },

	{ level: 'A2', prompt: 'Erzähle, was du gestern gemacht hast (3–4 Sätze).' },
	{ level: 'A2', prompt: 'Beschreibe deinen typischen Wochentag in 4–5 Sätzen.' },
	{ level: 'A2', prompt: 'Was hast du am Wochenende vor? Sage Plan, Leute, Wetter.' },
	{ level: 'A2', prompt: 'Du bist im Café: Bestelle ein Getränk und ein Stück Kuchen.' },
	{ level: 'A2', prompt: 'Erzähle, wo du wohnst und was dir am Viertel gefällt.' },
	{ level: 'A2', prompt: 'Was hast du heute zu Mittag gegessen? Erzähle kurz.' },
	{ level: 'A2', prompt: 'Du bist an der Supermarktkasse: Sage, dass du eine Tüte brauchst, und frage, ob du mit Karte zahlen kannst.' },
	{ level: 'A2', prompt: 'Erzähle von einem Hobby: Wie oft, mit wem, warum?' },

	{ level: 'B1', prompt: 'Stell dich kurz vor: Wer bist du, woher kommst du und was machst du beruflich oder im Studium?' },
	{ level: 'B1', prompt: 'Erkläre, was du studierst oder welchen Beruf du lernst, und warum du dich dafür interessierst.' },
	{ level: 'B1', prompt: 'Du sitzt im Restaurant: Bestelle höflich ein Hauptgericht, ein Getränk und bitte um die Rechnung.' },
	{ level: 'B1', prompt: 'Du bist in einer fremden Stadt: Bitte einen Passanten um Wegweisung zu einem nahegelegenen Bahnhof.' },
	{ level: 'B1', prompt: 'Du telefonierst mit einer Hausverwaltung: Stelle zwei konkrete Fragen zur Wohnung (z. B. Kaltmiete, Nebenkosten, Besichtigung).' },
	{ level: 'B1', prompt: 'Beschreibe leicht verständlich deine Symptome in der Apotheke und bitte um ein rezeptfreies Mittel.' },
	{ level: 'B1', prompt: 'Du bist an der Uni: Frage an der Infotheke nach Prüfungsterminen oder nach einem bestimmten Seminarraum.' },
	{ level: 'B1', prompt: 'Beschreibe ein Projekt, an dem du gearbeitet hast: Ziel, deine Rolle und ein Ergebnis.' },
	{ level: 'B1', prompt: 'Erkläre in einfachen Sätzen, warum du Deutsch lernst und wie du übst.' },

	{ level: 'B2', prompt: 'Stell dich in 4–6 Sätzen für ein Vorstellungsgespräch vor — Fähigkeiten, Erfahrung und was du suchst.' },
	{ level: 'B2', prompt: 'Diskutiere kurz Vor- und Nachteile vom Homeoffice für deinen Beruf.' },
	{ level: 'B2', prompt: 'Erzähle, was dir am Leben in Deutschland anders vorkommt als in deinem Heimatland.' },
	{ level: 'B2', prompt: 'Erkläre, wie sich dein Berufsfeld durch neue Technik (z. B. KI) verändert.' },
	{ level: 'B2', prompt: 'Beschreibe ein Buch, einen Film oder ein Erlebnis, das dich geprägt hat.' },
	{ level: 'B2', prompt: 'Was würdest du an deiner Stadt verbessern, wenn du Bürgermeister/in wärst? Begründe.' }
] as const;
