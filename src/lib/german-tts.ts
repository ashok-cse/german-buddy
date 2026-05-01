/** Slightly slower than default (1) for learner-friendly pacing. */
const GERMAN_TTS_RATE = 0.84;
const GERMAN_TTS_PITCH = 1;

/** 46-byte silent WAV used to unlock <audio> playback on iOS in `primeTts`. */
const SILENT_WAV_DATA_URL =
	'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=';

/** If Piper fails, skip it for this long before retrying — avoids hammering when offline. */
const PIPER_COOLDOWN_MS = 30_000;

type PiperState = 'unknown' | 'ok' | 'unavailable';
let piperState: PiperState = 'unknown';
let piperRetryAfter = 0;
/** Reference to the currently-playing Piper <audio> so a new speak call can interrupt it. */
let currentAudio: HTMLAudioElement | null = null;

/** Warm `/api/tts` fetch started right after converse JSON — overlaps English TTS + UI. */
let prefetchAbort: AbortController | null = null;
let prefetchPromise: Promise<Blob> | null = null;
let prefetchText = '';

function clearPiperPrefetch(): void {
	prefetchAbort?.abort();
	prefetchAbort = null;
	prefetchPromise = null;
	prefetchText = '';
}

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

/**
 * iOS (Safari + Chrome on iOS, all WebKit) only allows `speechSynthesis.speak`
 * if it has already been triggered inside a user gesture. After an `await`
 * (e.g. fetch, getUserMedia) the gesture context is lost and later speak()
 * calls are silently dropped. Call this synchronously inside a click/tap
 * handler to unlock the engine for the rest of the session.
 *
 * Also unlocks `HTMLAudioElement.play()` (used by the Piper path) by playing
 * a silent WAV — same iOS gesture restriction applies there.
 */
export function primeTts(): void {
	if (typeof window === 'undefined') return;
	try {
		if ('speechSynthesis' in window) {
			const synth = window.speechSynthesis;
			if (typeof synth.resume === 'function') synth.resume();
			const u = new SpeechSynthesisUtterance(' ');
			u.volume = 0;
			u.rate = 1;
			synth.speak(u);
		}
	} catch {
		/* ignore */
	}
	try {
		const a = new Audio(SILENT_WAV_DATA_URL);
		a.volume = 0;
		const p = a.play();
		if (p && typeof p.catch === 'function') p.catch(() => {});
	} catch {
		/* ignore */
	}
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

function pickVoiceForLang(
	voices: SpeechSynthesisVoice[],
	lang: string
): SpeechSynthesisVoice | undefined {
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

function stopCurrentAudio(): void {
	const a = currentAudio;
	currentAudio = null;
	if (!a) return;
	try {
		a.onended = null;
		a.onerror = null;
		a.pause();
		const src = a.src;
		a.removeAttribute('src');
		if (src && src.startsWith('blob:')) URL.revokeObjectURL(src);
	} catch {
		/* ignore */
	}
}

function shouldTryPiper(): boolean {
	if (piperState === 'ok') return true;
	if (piperState === 'unavailable') return Date.now() >= piperRetryAfter;
	return true;
}

function markPiperUnavailable(): void {
	piperState = 'unavailable';
	piperRetryAfter = Date.now() + PIPER_COOLDOWN_MS;
}

/**
 * Start loading Piper WAV for `text` before `speakGerman` — e.g. when `/api/converse`
 * returns so synthesis runs in parallel with English tutor speech.
 */
export function prefetchGermanTts(text: string): void {
	if (typeof window === 'undefined') return;
	const trimmed = text.trim();
	if (!trimmed || !shouldTryPiper()) return;

	clearPiperPrefetch();
	const ac = new AbortController();
	prefetchAbort = ac;
	prefetchText = trimmed;
	prefetchPromise = (async (): Promise<Blob> => {
		const res = await fetch('/api/tts', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ text: trimmed }),
			cache: 'no-store',
			signal: ac.signal
		});
		if (!res.ok) throw new Error(`tts ${res.status}`);
		const blob = await res.blob();
		if (blob.size === 0) throw new Error('tts empty');
		return blob;
	})();
}

/**
 * Synthesize via the server-side Piper proxy and play through `<audio>`.
 * Resolves on natural end / playback error. Rejects only when synthesis
 * itself failed (network / non-2xx / play() blocked) so the caller can fall
 * back to browser TTS without firing `onEnd` twice.
 */
async function speakWithPiper(text: string, opts?: SpeakOptions): Promise<void> {
	const trimmed = text.trim();
	let blob: Blob | undefined;

	if (prefetchText === trimmed && prefetchPromise) {
		const p = prefetchPromise;
		prefetchText = '';
		prefetchPromise = null;
		prefetchAbort = null;
		try {
			blob = await p;
		} catch {
			blob = undefined;
		}
	}

	if (!blob || blob.size === 0) {
		const res = await fetch('/api/tts', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ text: trimmed }),
			cache: 'no-store'
		});
		if (!res.ok) throw new Error(`tts ${res.status}`);
		blob = await res.blob();
		if (blob.size === 0) throw new Error('tts empty');
	}

	const url = URL.createObjectURL(blob);
	const audio = new Audio(url);
	// Modern browsers default `preservesPitch` to true, but be explicit so
	// learner-rate playback (e.g. 0.84x) doesn't drop pitch on older WebKit.
	audio.preservesPitch = true;
	audio.playbackRate = clampRate(opts?.rate ?? GERMAN_TTS_RATE);

	let done = false;
	let watchdog: ReturnType<typeof setTimeout> | null = null;
	const finish = () => {
		if (done) return;
		done = true;
		if (watchdog !== null) clearTimeout(watchdog);
		if (currentAudio === audio) currentAudio = null;
		audio.onended = null;
		audio.onerror = null;
		URL.revokeObjectURL(url);
		opts?.onEnd?.();
	};

	// Register handlers BEFORE play() so a fast-fire `ended`/`error` (or any
	// browser state quirk) can't slip through the gap and leave the caller
	// waiting forever.
	audio.onended = finish;
	audio.onerror = finish;

	try {
		await audio.play();
	} catch (e) {
		// play() rejected (e.g. iOS gesture lost). Tear down without firing
		// onEnd — the caller will fall back to browser TTS and that path will
		// fire onEnd exactly once.
		audio.onended = null;
		audio.onerror = null;
		URL.revokeObjectURL(url);
		throw e;
	}

	piperState = 'ok';
	currentAudio = audio;

	// Belt-and-suspenders watchdog: HTMLAudioElement is supposed to fire
	// `ended` reliably, but in the wild we've seen browsers occasionally
	// silently stall (decoding glitch, blob revoked early, OS audio hiccup).
	// Without this, the conversation page would wait on `onEnd` forever.
	const expectedSec = Number.isFinite(audio.duration) && audio.duration > 0 ? audio.duration : 8;
	const rate = audio.playbackRate || 1;
	const watchdogMs = Math.ceil((expectedSec / rate) * 1000) + 1500;
	watchdog = setTimeout(finish, watchdogMs);
}

function speakGermanBrowser(text: string, opts?: SpeakOptions): void {
	if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
		opts?.onEnd?.();
		return;
	}
	const synth = window.speechSynthesis;
	synth.cancel();

	const run = () => speakWithVoices(synth, text, opts);

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

/**
 * Read German text aloud. Uses server-side Piper (Thorsten) for high-quality
 * neural German pronunciation; falls back transparently to the browser's
 * `SpeechSynthesis` if Piper is unreachable. Pass `onEnd` to be notified when
 * speech finishes (e.g. to resume mic in a conversation).
 */
export function speakGerman(text: string, opts?: SpeakOptions): void {
	if (typeof window === 'undefined') {
		opts?.onEnd?.();
		return;
	}
	const trimmed = text.trim();
	if (!trimmed) {
		opts?.onEnd?.();
		return;
	}

	if (prefetchText && prefetchText !== trimmed) {
		clearPiperPrefetch();
	}

	if ('speechSynthesis' in window) window.speechSynthesis.cancel();
	stopCurrentAudio();

	if (!shouldTryPiper()) {
		speakGermanBrowser(trimmed, opts);
		return;
	}

	void speakWithPiper(trimmed, opts).catch(() => {
		markPiperUnavailable();
		speakGermanBrowser(trimmed, opts);
	});
}

/**
 * Cancel any in-flight German TTS — both the browser `SpeechSynthesis` queue
 * and any Piper `<audio>` currently playing. Does NOT fire `onEnd`; callers
 * are responsible for resetting their own state if they invoke this mid-speak.
 */
export function stopGermanTts(): void {
	if (typeof window === 'undefined') return;
	if ('speechSynthesis' in window) {
		try {
			window.speechSynthesis.cancel();
		} catch {
			/* ignore */
		}
	}
	stopCurrentAudio();
	clearPiperPrefetch();
}
