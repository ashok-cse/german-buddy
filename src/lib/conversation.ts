export type ConversationMessage = {
	role: 'user' | 'assistant';
	content: string;
};

/** A single word-level correction. `wrong` is the exact token the user wrote; `right` is the fix. */
export type WordCorrection = {
	wrong: string;
	right: string;
	/** Short English hint about why (optional). */
	note?: string;
};

export type ConversationTurnResult = {
	/** What the AI says to the user. In roleplay it's German; in tutor it's English. */
	assistant: string;
	/** German phrase to imitate / attempt — used in tutor mode. */
	germanTarget?: string;
	/** Corrected German version of the user's last message (omit if already fine). */
	correctedUser?: string;
	/** Pinpointed word-level fixes (rendered with char-level highlighting). */
	corrections?: WordCorrection[];
	/** Short English explanation of the correction / teaching point. */
	explanation?: string;
	/** Simple pronunciation guide for the corrected German (ASCII-friendly). */
	pronunciation?: string;
};

export type ConversationStyle = 'roleplay' | 'tutor';

export const CONVERSATION_STYLES: readonly ConversationStyle[] = ['roleplay', 'tutor'] as const;

export const CONVERSATION_STYLE_LABELS: Record<ConversationStyle, string> = {
	roleplay: 'Roleplay',
	tutor: 'Tutor'
};

export const CONVERSATION_STYLE_HINTS: Record<ConversationStyle, string> = {
	roleplay: 'AI speaks German in character. You reply in German. Immersive.',
	tutor: 'AI gives short English instructions. You speak the German. AI corrects in English.'
};

export type GermanLevel = 'A1' | 'A2' | 'B1' | 'B2';

export const GERMAN_LEVELS = ['A1', 'A2', 'B1', 'B2'] as const satisfies readonly GermanLevel[];

export const GERMAN_LEVEL_HINTS: Record<GermanLevel, string> = {
	A1:
		'Beginner — very short phrases, easy vocabulary; prefers words without ä/ö/ü when possible.',
	A2: 'Elementary — simple sentences, basic past tense, daily vocabulary.',
	B1: 'Intermediate — connected ideas, opinions, clear past/future.',
	B2: 'Upper-intermediate — fluent everyday talk, nuanced opinions.'
};

export type ConversationScenario = {
	readonly id: string;
	/** Short English label for the picker. */
	readonly label: string;
	/** German one-liner setting the scene + assistant's role. */
	readonly setup: string;
};

export const CONVERSATION_SCENARIOS: readonly ConversationScenario[] = [
	{
		id: 'small-talk',
		label: 'Small talk',
		setup:
			'Lockerer Smalltalk auf Deutsch (Wetter, Wochenende, Hobbys). Du bist eine freundliche Bekannte.'
	},
	{
		id: 'bakery',
		label: 'At the bakery',
		setup:
			'Du bist Verkäufer/in in einer deutschen Bäckerei. Begrüße die Kundschaft und nimm eine Bestellung auf.'
	},
	{
		id: 'restaurant',
		label: 'Restaurant',
		setup:
			'Du bist Kellner/in in einem deutschen Restaurant. Empfehle etwas, nimm die Bestellung auf, frage nach Getränken und der Rechnung.'
	},
	{
		id: 'supermarket',
		label: 'Supermarket checkout',
		setup:
			'Du bist Kassierer/in im Supermarkt. Frage nach Tüte, Bonus-Karte und Bezahlart (Karte oder bar).'
	},
	{
		id: 'directions',
		label: 'Asking directions',
		setup:
			'Du bist Passant/in in einer deutschen Stadt. Erkläre höflich den Weg zu Bahnhof, Apotheke oder Restaurant.'
	},
	{
		id: 'transport',
		label: 'Train station',
		setup:
			'Du bist Mitarbeiter/in am DB-Schalter. Hilf bei Tickets, Gleisen und Verspätungen.'
	},
	{
		id: 'doctor',
		label: 'At the doctor',
		setup:
			'Du bist Hausärztin/Hausarzt. Frage nach Symptomen, gib einfache Empfehlungen und Termine.'
	},
	{
		id: 'pharmacy',
		label: 'Pharmacy',
		setup:
			'Du bist Apotheker/in. Frage nach Symptomen und schlage rezeptfreie Mittel vor.'
	},
	{
		id: 'apartment',
		label: 'Apartment viewing',
		setup:
			'Du bist Vermieter/in bei einer Wohnungsbesichtigung. Beantworte Fragen zu Miete, Nebenkosten und Übergabe.'
	},
	{
		id: 'job-interview',
		label: 'Job interview',
		setup:
			'Du bist Personaler/in. Stelle freundliche, klare Fragen zu Erfahrung, Stärken und Motivation.'
	},
	{
		id: 'phone-housing',
		label: 'Phone: housing office',
		setup:
			'Du bist Mitarbeiter/in einer Hausverwaltung am Telefon. Beantworte Fragen zu Besichtigung, Vertrag und Kaution.'
	},
	{
		id: 'university',
		label: 'University info desk',
		setup:
			'Du bist an der Uni-Infotheke. Hilf bei Prüfungsterminen, Räumen und Anmeldungen.'
	}
] as const;

export function getScenarioById(id: string): ConversationScenario | undefined {
	return CONVERSATION_SCENARIOS.find((s) => s.id === id);
}

