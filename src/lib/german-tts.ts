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

export type SpeakOptions = {
	/** Fires once speech finishes (or fails to start). Always called exactly once. */
	onEnd?: () => void;
	/** Override speech rate. Browsers clamp to ~0.1–10. Default depends on language. */
	rate?: number;
};

function clampRate(r: number): number {
	if (!Number.isFinite(r)) return 1;
	return Math.min(2, Math.max(0.4, r));
}

function pickVoiceForLang(voices: SpeechSynthesisVoice[], lang: string): SpeechSynthesisVoice | undefined {
	const tag = lang.toLowerCase();
	const prefix = tag.split('-')[0];
	const candidates = voices.filter((v) => {
		const l = v.lang.toLowerCase().replace('_', '-');
		return l === tag || l.startsWith(`${prefix}-`) || l === prefix;
	});
	if (candidates.length === 0) return undefined;
	return [...candidates].sort((a, b) => {
		const score = (v: SpeechSynthesisVoice): number => {
			let s = 0;
			const n = v.name.toLowerCase();
			if (n.includes('premium') || n.includes('enhanced') || n.includes('neural')) s += 10;
			if (n.includes('google') || n.includes('microsoft') || n.includes('apple')) s += 4;
			if (v.localService) s += 2;
			return s;
		};
		return score(b) - score(a);
	})[0];
}

/** Generic TTS: pick the best available voice for `lang` and speak `text`. */
export function speak(text: string, lang: string, opts?: SpeakOptions): void {
	if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
		opts?.onEnd?.();
		return;
	}
	const synth = window.speechSynthesis;
	const trimmed = text.trim();
	if (!trimmed) {
		opts?.onEnd?.();
		return;
	}
	synth.cancel();

	const run = () => {
		const u = new SpeechSynthesisUtterance(trimmed);
		u.lang = lang;
		const defaultRate = lang.toLowerCase().startsWith('de') ? GERMAN_TTS_RATE : 1;
		u.rate = clampRate(opts?.rate ?? defaultRate);
		u.pitch = 1;
		u.volume = 1;
		const voice = pickVoiceForLang(synth.getVoices(), lang);
		if (voice) u.voice = voice;
		let done = false;
		const finish = () => {
			if (done) return;
			done = true;
			opts?.onEnd?.();
		};
		u.onend = finish;
		u.onerror = finish;
		synth.speak(u);
	};

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

function speakWithVoices(synth: SpeechSynthesis, text: string, opts?: SpeakOptions): void {
	const u = new SpeechSynthesisUtterance(text);
	u.lang = 'de-DE';
	u.rate = clampRate(opts?.rate ?? GERMAN_TTS_RATE);
	u.pitch = GERMAN_TTS_PITCH;
	u.volume = 1;
	const voice = pickGermanVoice(synth.getVoices());
	if (voice) u.voice = voice;
	let done = false;
	const finish = () => {
		if (done) return;
		done = true;
		opts?.onEnd?.();
	};
	u.onend = finish;
	u.onerror = finish;
	synth.speak(u);
}

/**
 * Read German text aloud using browser TTS: slower pace and best available `de-*` voice.
 * Pass `onEnd` to be notified when speech finishes (e.g. to resume mic in a conversation).
 */
export function speakGerman(text: string, opts?: SpeakOptions): void {
	if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
		opts?.onEnd?.();
		return;
	}
	const synth = window.speechSynthesis;
	const trimmed = text.trim();
	if (!trimmed) {
		opts?.onEnd?.();
		return;
	}

	synth.cancel();

	const run = () => speakWithVoices(synth, trimmed, opts);

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
