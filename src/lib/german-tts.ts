/** Piper / `<audio>` playback at normal speed for smoother dialogue timing. */
const GERMAN_TTS_RATE = 1;

/** 46-byte silent WAV used to unlock <audio> playback on iOS in `primeTts`. */
const SILENT_WAV_DATA_URL =
	'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=';

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
	/**
	 * When several `en-*` system voices exist, bias toward male-presenting ones
	 * (best-effort name heuristics) so tutor English aligns with Piper Thorsten.
	 */
	preferMale?: boolean;
};

function clampRate(r: number): number {
	if (!Number.isFinite(r)) return 1;
	return Math.min(2, Math.max(0.4, r));
}

/** Best-effort gender bias from voice names — Web Speech API has no gender field. */
function englishMaleVoiceBias(name: string): number {
	const n = name.toLowerCase();
	let s = 0;
	const male = [
		'male',
		'(male)',
		'daniel',
		'david',
		'fred',
		'microsoft mark',
		'microsoft david',
		'tom ',
		'arthur',
		'ralph',
		'bruce',
		'aaron',
		'gordon',
		'nick ',
		'google us english male',
		'uk english male',
		'english male'
	];
	const female = [
		'female',
		'zira',
		'samantha',
		'karen',
		'victoria',
		'moira',
		'fiona',
		'tessa',
		'aria',
		'ivy',
		'joanna',
		'susan',
		'linda',
		'hazel',
		'heather',
		'sonia',
		'martha',
		'sarah',
		'anna',
		'melissa',
		'allison',
		'google uk english female',
		'google us english female'
	];
	for (const h of male) if (n.includes(h)) s += 28;
	for (const h of female) if (n.includes(h)) s -= 45;
	return s;
}

function pickVoiceForLang(
	voices: SpeechSynthesisVoice[],
	lang: string,
	options?: Pick<SpeakOptions, 'preferMale'>
): SpeechSynthesisVoice | undefined {
	const tag = lang.toLowerCase();
	const prefix = tag.split('-')[0];
	const candidates = voices.filter((v) => {
		const l = v.lang.toLowerCase().replace('_', '-');
		return l === tag || l.startsWith(`${prefix}-`) || l === prefix;
	});
	if (candidates.length === 0) return undefined;
	const wantMaleEn = !!options?.preferMale && prefix === 'en';
	return [...candidates].sort((a, b) => {
		const score = (v: SpeechSynthesisVoice): number => {
			let s = 0;
			const n = v.name.toLowerCase();
			if (wantMaleEn) s += englishMaleVoiceBias(v.name);
			if (n.includes('premium') || n.includes('enhanced') || n.includes('neural')) s += 10;
			if (n.includes('google') || n.includes('microsoft') || n.includes('apple')) s += 4;
			if (v.localService) s += 2;
			return s;
		};
		return score(b) - score(a);
	})[0];
}

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
		const voice = pickVoiceForLang(synth.getVoices(), lang, {
			preferMale: opts?.preferMale
		});
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

/**
 * Start loading Piper WAV for `text` before `speakGerman` — e.g. when `/api/converse`
 * returns so synthesis runs in parallel with English tutor speech.
 */
export function prefetchGermanTts(text: string): void {
	if (typeof window === 'undefined') return;
	const trimmed = text.trim();
	if (!trimmed) return;

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
 * Rejects when fetch or playback cannot start — caller must invoke `onEnd` once.
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

	audio.onended = finish;
	audio.onerror = finish;

	try {
		await audio.play();
	} catch {
		audio.onended = null;
		audio.onerror = null;
		URL.revokeObjectURL(url);
		throw new Error('audio play blocked');
	}

	currentAudio = audio;

	const expectedSec = Number.isFinite(audio.duration) && audio.duration > 0 ? audio.duration : 8;
	const rate = audio.playbackRate || 1;
	const watchdogMs = Math.ceil((expectedSec / rate) * 1000) + 1500;
	watchdog = setTimeout(finish, watchdogMs);
}

/**
 * German TTS via Piper only (`/api/tts`). No browser `SpeechSynthesis` fallback;
 * if Piper or `<audio>` fails, `onEnd` still runs once so callers (e.g. mic)
 * never hang.
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

	void speakWithPiper(trimmed, opts).catch(() => {
		opts?.onEnd?.();
	});
}

/**
 * Cancel Piper `<audio>` and any in-flight prefetch. Does NOT fire `onEnd`.
 * Still clears browser speech synthesis queue (used for English tutor lines).
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
