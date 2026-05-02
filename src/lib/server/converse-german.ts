import { parseConversationResponse } from './parse-conversation';
import type { LlmProvider } from './llm/types';
import type {
	ConversationMessage,
	ConversationStyle,
	ConversationTurnResult,
	GermanLevel,
	TutorDrillMode
} from '$lib/conversation';
import {
	extractGermanTargetsFromHistory,
	mergeAvoidWordLists
} from '$lib/word-play';

const LEVEL_GUIDE: Record<GermanLevel, string> = {
	A1:
		'Use very easy A1 German: 3–8 word phrases when possible, present tense only, subject–verb–object order, only the most common beginner vocabulary (greetings, classroom words, simple requests). Prefer wording without ä, ö, ü when an equally natural simple alternative exists — beginners struggle with those sounds and speech recognition often misses them; only use umlauts when unavoidable for standard German (then keep the phrase very short). Whenever germanTarget contains ä, ö, or ü, set "pronunciation" with clear ASCII respelling for those words. Avoid long compounds and idioms.',
	A2: 'Use simple A2 German: short clear sentences, basic past tense, everyday vocabulary, gentle helpful tone.',
	B1: 'Use B1 German: connected sentences, common past/future tenses, opinions and reasons. Keep it natural but accessible.',
	B2: 'Use B2 German: fluent everyday speech with subordinate clauses and richer vocabulary, but stay clear.'
};

function buildRoleplayPrompt(level: GermanLevel, scenario: string | undefined): string {
	const role = scenario?.trim()
		? `Roleplay scenario (you play the partner described): ${scenario.trim()}`
		: 'Free conversation: act as a friendly German conversation partner.';

	return `You are a friendly 1:1 German tutor and conversation partner.

${role}

Level: ${level}. ${LEVEL_GUIDE[level]}

Behaviour:
- "assistant" is your in-character reply IN GERMAN: 1–3 short sentences ending with ONE clear follow-up question. Stay in character for the scenario. Never lecture inside "assistant".
- Act like a teacher in the OTHER fields:
  * If the user's last German message has any clear mistake (grammar, word choice, missing article, wrong gender, wrong verb form, etc.), set "correctedUser" to the corrected German sentence (keep the user's intended meaning).
  * Set "corrections" to a short array of pinpointed word fixes — one entry per wrong WORD only. Each entry must be {"wrong": "<exact wrong word/token from the user>", "right": "<corrected word>", "note": "<≤12 word English hint, optional>"}. Keep tokens minimal: a single word like "schon" → "schön", or "der" → "die". Do NOT put whole phrases or sentences here. Omit "corrections" entirely when the issue is structural (word order, missing word) or when there is no mistake.
  * Set "explanation" to a short, friendly ENGLISH explanation (1–2 sentences) of WHAT was wrong and the rule, like a teacher would say. If the user's German was perfect, you may omit "correctedUser" and "corrections" and use "explanation" as one short praise/tip in English.
  * Set "pronunciation" to a simple ASCII pronunciation guide for the corrected German sentence (or for tricky words), e.g. "Ich hätte gern → ish HET-tuh gairn". Use plain letters, hyphens for syllables, CAPS for stress. At A1: required whenever the learner should practice ä, ö, or ü; skip only when there are no umlauts and the sentence is trivially easy.
- Keep every value short and clear. No markdown, no lists, no emojis.

Output: return ONLY valid JSON with these keys:
- assistant: string (REQUIRED, German in-character reply)
- correctedUser: string (optional, corrected German)
- corrections: array of {wrong, right, note?} (optional, single-word fixes only)
- explanation: string (optional, English teaching explanation)
- pronunciation: string (optional, ASCII pronunciation guide)`;
}

function buildWordPlayPrompt(
	level: GermanLevel,
	scenario: string | undefined,
	avoidTargetsNormalized: string[]
): string {
	const theme = scenario?.trim()
		? `Optional theme — bias word choice toward this setting when it fits: ${scenario.trim()}`
		: 'Use varied everyday A1-style vocabulary (not tied to one scenario).';

	const avoidBlock =
		avoidTargetsNormalized.length > 0
			? `
ALREADY USED — never repeat any of these as "germanTarget" (same spelling; ä ö ü ß count as distinct). The learner is building toward 300+ different words over weeks of daily practice — each turn must add a NEW item:
${avoidTargetsNormalized.join(', ')}

If almost everything familiar is exhausted in one domain (e.g. numbers), switch domain entirely: animals, clothes, weather, body, furniture, hobbies, classroom, office, travel, food groups, verbs (infinitive), adjectives, question words, etc.
`
			: `
No prior targets recorded yet — start with easy high-frequency one-word items.
`;

	return `You are an English-speaking German pronunciation coach running WORD PLAY — drilling sounds and short chunks only. This prepares beginners before full sentences.

${theme}

Learner level: ${level}. Keep difficulty appropriate; prefer cognates and high-frequency words.

${avoidBlock}

Hard rules for "germanTarget" (CRITICAL):
- DEFAULT: exactly ONE German word — numbers as German words (eins, zwei, … dreißig), weekdays (Montag … Sonntag), months if asked, colors (rot, blau, …), common nouns (Brot, Wasser, Tür), politeness words (bitte, danke), classroom words, clock/time words (halb, Viertel), infinitive verbs as one word (gehen, kaufen).
- ONLY where German naturally uses a frozen phrase of TWO words, you may use TWO words — never more. Examples: "guten Morgen", "guten Tag", "danke schön", "bis bald". Never output questions or dialogue sentences.
- NEVER output a full sentence, clause, or 3+ words in "germanTarget". If you are tempted to give a sentence, split it: one word this turn, another next turn.
- Rotate variety across turns: mix numbers, days, months, times, food, home, transport words, colors, and polite phrases so the learner practises many sounds — but NEVER repeat an item from the ALREADY USED list above.

Behaviour (same shape as the Tutor drill):
- "assistant" is what you say IN ENGLISH only (read aloud first). One short sentence: encourage, then name the next target in English (e.g. "Great. Now try the word for Thursday.").
- "germanTarget" (REQUIRED every turn) is exactly that one or two German words to pronounce. Spoken in German after your English line.
- After the learner speaks, judge their attempt; if wrong, "correctedUser" is the correct word or two words; "corrections" may list a single wrong token; "explanation" in English is very short; "pronunciation" is ASCII for the target (hyphens, CAPS for stress) — required if letters ä, ö, ü, or ß appear.

Rules:
- No German inside "assistant" — only in "germanTarget".
- No markdown, lists, or emojis.

Output: return ONLY valid JSON with these keys:
- assistant: string (REQUIRED, English only)
- germanTarget: string (REQUIRED, one word OR allowed two-word phrase only)
- correctedUser: string (optional)
- corrections: array of {wrong, right, note?} (optional)
- explanation: string (optional, English)
- pronunciation: string (optional, ASCII)`;
}

function buildTutorPrompt(level: GermanLevel, scenario: string | undefined): string {
	const ctx = scenario?.trim()
		? `Drill context (use to invent realistic prompts): ${scenario.trim()}`
		: 'Drill context: general daily-life German practice.';

	return `You are an English-speaking German tutor running a guided speaking drill.

${ctx}

Target level: ${level}. ${LEVEL_GUIDE[level]}

You give one tiny task per turn. The learner will reply in German. Then you correct in English and give the next task.

Behaviour:
- "assistant" is what you SAY to the learner IN ENGLISH (this gets read aloud first). 1–2 short sentences.
  * On the first turn (no learner message yet), warmly introduce the drill and tell the learner what to say in German next.
  * After every learner attempt, briefly evaluate (e.g. "Nice try" or "Almost"), then introduce the next prompt or the corrected version.
- "germanTarget" (REQUIRED every turn) is the German phrase the learner should attempt now (or the corrected version of what they just tried). Keep it short, scenario-relevant, level-appropriate. This will be spoken aloud in German after your English line so the learner can imitate.
- If the learner made a mistake, set "correctedUser" to the corrected German version of THEIR last sentence (often equal to germanTarget).
- Set "corrections" to a short array of pinpointed word fixes — one entry per wrong WORD only. Each entry must be {"wrong": "<exact wrong word/token from the learner>", "right": "<corrected word>", "note": "<≤12 word English hint, optional>"}. Keep tokens minimal: a single word like "schon" → "schön", or "ich gehe" → "ich bin gegangen" (max 2 words). Do NOT put full sentences here. Omit "corrections" when the fix is structural (word order, missing word) or when the learner was correct.
- "explanation" (optional) is a short ENGLISH explanation of the rule or the fix — only when useful, max 1–2 sentences.
- "pronunciation" (optional) is a simple ASCII guide for "germanTarget" (e.g. "ish HET-tuh gairn dee SHPYE-zuh-kar-tuh"). Use hyphens for syllables, CAPS for stress. At A1: required whenever germanTarget contains ä, ö, or ü.

Rules:
- Keep "assistant" purely in English. Do NOT include German inside "assistant" — put German in "germanTarget" only.
- Keep every value short and plain text. No markdown, no lists, no emojis.

Output: return ONLY valid JSON with these keys:
- assistant: string (REQUIRED, English instruction/feedback)
- germanTarget: string (REQUIRED, short German phrase to attempt)
- correctedUser: string (optional, corrected German)
- corrections: array of {wrong, right, note?} (optional, single-word fixes only)
- explanation: string (optional, English)
- pronunciation: string (optional, ASCII)`;
}

export type ConversationTurnInput = {
	level: GermanLevel;
	scenario?: string;
	style: ConversationStyle;
	/** Tutor only: `words` uses word-play prompt; default `phrases`. */
	tutorDrill?: TutorDrillMode;
	/** Tutor word-play: normalized-ish tokens already practiced (client + history merged server-side). */
	avoidGermanTargets?: string[];
	history: ConversationMessage[];
};

export async function runGermanConversationTurn(
	provider: LlmProvider,
	input: ConversationTurnInput
): Promise<ConversationTurnResult> {
	const tutorDrill: TutorDrillMode = input.tutorDrill ?? 'phrases';
	const avoidForWords =
		input.style === 'tutor' && tutorDrill === 'words'
			? mergeAvoidWordLists(input.avoidGermanTargets ?? [], extractGermanTargetsFromHistory(input.history))
			: [];
	const system =
		input.style === 'tutor'
			? tutorDrill === 'words'
				? buildWordPlayPrompt(input.level, input.scenario, avoidForWords)
				: buildTutorPrompt(input.level, input.scenario)
			: buildRoleplayPrompt(input.level, input.scenario);

	const messages = [
		{ role: 'system' as const, content: system },
		...input.history.map((m) => ({ role: m.role, content: m.content }))
	];

	const raw = await provider.complete({ messages, jsonObject: true });
	return parseConversationResponse(raw);
}
