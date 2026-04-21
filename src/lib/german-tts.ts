/** Slightly slower than default (1) for learner-friendly pacing. */
const GERMAN_TTS_RATE = 0.84;
const GERMAN_TTS_PITCH = 1;

function scoreGermanVoice(v: SpeechSynthesisVoice): number {
	let s = 0;
	const lang = v.lang.toLowerCase().replace('_', '-');
	if (lang === 'de-de') s += 12;
	else if (lang.startsWith('de')) s += 6;
	const n = v.name.toLowerCase();
	if (n.includes('premium') || n.includes('enhanced') || n.includes('neural')) s += 10;
	if (n.includes('google') || n.includes('microsoft') || n.includes('apple')) s += 4;
	if (v.localService) s += 2;
	return s;
}

function pickGermanVoice(voices: SpeechSynthesisVoice[]): SpeechSynthesisVoice | undefined {
	const de = voices.filter((v) => v.lang.toLowerCase().startsWith('de'));
	if (de.length === 0) return undefined;
	return [...de].sort((a, b) => scoreGermanVoice(b) - scoreGermanVoice(a))[0];
}

function speakWithVoices(synth: SpeechSynthesis, text: string): void {
	const u = new SpeechSynthesisUtterance(text);
	u.lang = 'de-DE';
	u.rate = GERMAN_TTS_RATE;
	u.pitch = GERMAN_TTS_PITCH;
	u.volume = 1;
	const voice = pickGermanVoice(synth.getVoices());
	if (voice) u.voice = voice;
	synth.speak(u);
}

/**
 * Read German text aloud using browser TTS: slower pace and best available `de-*` voice.
 */
export function speakGerman(text: string): void {
	if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
	const synth = window.speechSynthesis;
	const trimmed = text.trim();
	if (!trimmed) return;

	synth.cancel();

	const run = () => speakWithVoices(synth, trimmed);

	if (synth.getVoices().length > 0) {
		run();
		return;
	}

	let started = false;
	const runOnce = () => {
		if (started) return;
		started = true;
		synth.removeEventListener('voiceschanged', onVoices);
		window.clearTimeout(fallbackId);
		run();
	};
	const onVoices = () => runOnce();
	synth.addEventListener('voiceschanged', onVoices);
	const fallbackId = window.setTimeout(runOnce, 400);
}
