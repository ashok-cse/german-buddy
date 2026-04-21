import type { CorrectionResult } from '$lib/correction';
import { parseCorrectionResponse } from './parse-correction';
import type { LlmProvider } from './llm/types';

const SYSTEM_PROMPT = `You help beginner to intermediate learners of German.

The user answers a German practice prompt. Your job:
- Preserve the user's intended meaning.
- Fix grammar and word choice in "corrected" (clear, learner-friendly German).
- In "natural", write a short version that sounds more native but stays understandable (not slang-heavy).
- In "english", give a simple, faithful English meaning of what they wanted to say.
- In "tip", give exactly ONE short, practical tip (one sentence), focused on their most important mistake or upgrade.
- "original" must echo the user's German answer verbatim (trim outer whitespace only).

Output rules:
- Return ONLY valid JSON, no markdown, no code fences, no commentary.
- All five keys are required strings: original, corrected, natural, english, tip.
- Keep each string reasonably short (roughly under 120 words each unless the user wrote more).`;

export async function runGermanCorrection(
	provider: LlmProvider,
	practicePrompt: string,
	userAnswer: string
): Promise<CorrectionResult> {
	const userPayload = `Practice prompt (German, for context only):\n${practicePrompt}\n\nStudent answer in German:\n${userAnswer}`;

	const raw = await provider.complete({
		messages: [
			{ role: 'system', content: SYSTEM_PROMPT },
			{ role: 'user', content: userPayload }
		],
		jsonObject: true
	});

	return parseCorrectionResponse(raw, userAnswer.trim());
}
