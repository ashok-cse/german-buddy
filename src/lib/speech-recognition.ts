/**
 * Subset of the Web Speech API used here (DOM lib may omit `SpeechRecognition` in some setups).
 */
type WebSpeechRecognition = {
	lang: string;
	continuous: boolean;
	interimResults: boolean;
	/** Chromium: request multiple ASR hypotheses; we pick highest confidence. */
	maxAlternatives?: number;
	start(): void;
	stop(): void;
	onresult: ((this: WebSpeechRecognition, ev: SpeechRecognitionEvent) => void) | null;
	onerror: ((this: WebSpeechRecognition, ev: SpeechRecognitionErrorEvent) => void) | null;
	onend: ((this: WebSpeechRecognition, ev: Event) => void) | null;
};

type WebSpeechRecognitionCtor = new () => WebSpeechRecognition;

/** Web Speech API ctor (Chrome/Safari use webkit prefix). */
export function getSpeechRecognitionCtor(): WebSpeechRecognitionCtor | null {
	if (typeof window === 'undefined') return null;
	const w = window as Window &
		typeof globalThis & { webkitSpeechRecognition?: WebSpeechRecognitionCtor };
	return (w as unknown as { SpeechRecognition?: WebSpeechRecognitionCtor }).SpeechRecognition ??
		w.webkitSpeechRecognition ??
		null;
}

export type DictationHandlers = {
	onFinal: (text: string) => void;
	onInterim: (text: string) => void;
	onError: (message: string) => void;
	/** Called once after recognition fully stops (user stopped or fatal error). */
	onStopped: () => void;
	/** Called after the mic session successfully starts (not called on immediate failure). */
	onReady?: () => void;
	/** Called when audible speech is first detected by the local VAD. */
	onSpeechStart?: () => void;
	/** Called after sustained silence following speech (VAD-detected end of utterance). */
	onSpeechEnd?: () => void;
	/** Called once if calibration finds the ambient noise floor too high to recognise speech reliably. */
	onNoisyEnvironment?: () => void;
};

export type DictationControl = { stop: () => void };

/** Constraints we want any time we open the mic — most browsers default to these,
 *  but stating them explicitly is necessary on older Safari and on Chromium-based
 *  embedded webviews where defaults can be off. */
const MIC_CONSTRAINTS: MediaTrackConstraints = {
	noiseSuppression: true,
	echoCancellation: true,
	autoGainControl: true
};

/**
 * Ask the OS/browser for microphone permission once, up-front. Resolves true
 * if the user grants access (or had already granted it), false if they denied
 * or no mic is available. Releases the stream immediately so the indicator
 * doesn't stay on until the recogniser starts.
 */
export async function ensureMicPermission(): Promise<boolean> {
	if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
		return true;
	}
	try {
		const stream = await navigator.mediaDevices.getUserMedia({ audio: MIC_CONSTRAINTS });
		stream.getTracks().forEach((t) => t.stop());
		return true;
	} catch {
		return false;
	}
}

type VadHandlers = Pick<DictationHandlers, 'onSpeechStart' | 'onSpeechEnd' | 'onNoisyEnvironment'>;

/** Lightweight Voice Activity Detector running on a parallel mic stream.
 *  Used to (a) reset auto-submit timers while the user is actively speaking
 *  even if the speech recogniser produces no transcripts (typical in noisy
 *  rooms), (b) submit promptly when the user truly stops, (c) warn the user
 *  if the ambient noise floor is too high for reliable recognition. */
async function startVad(handlers: VadHandlers): Promise<{ stop: () => void } | null> {
	if (typeof window === 'undefined' || typeof navigator === 'undefined') return null;
	if (!navigator.mediaDevices?.getUserMedia) return null;
	const w = window as Window & { webkitAudioContext?: typeof AudioContext };
	const AudioCtx = w.AudioContext ?? w.webkitAudioContext;
	if (!AudioCtx) return null;

	let stream: MediaStream;
	try {
		stream = await navigator.mediaDevices.getUserMedia({ audio: MIC_CONSTRAINTS });
	} catch {
		return null;
	}

	let ctx: AudioContext;
	try {
		ctx = new AudioCtx();
	} catch {
		stream.getTracks().forEach((t) => t.stop());
		return null;
	}

	const source = ctx.createMediaStreamSource(stream);
	const analyser = ctx.createAnalyser();
	analyser.fftSize = 1024;
	source.connect(analyser);
	const buf = new Uint8Array(analyser.fftSize);

	let stopped = false;
	let calibrating = true;
	const calibration: number[] = [];
	let speechMin = 0.012;
	let aboveFrames = 0;
	let belowFrames = 0;
	let speaking = false;
	let noisyEmitted = false;
	let firstSeenAt = 0;

	// ~60fps → ~3 frames ≈ 50ms to start. German learners pause mid-clause longer
	// than EN speakers — ~110 frames ≈ 1.85s below threshold before we declare
	// “speech ended” (when parallel VAD is enabled).
	const ABOVE_FRAMES_TO_START = 3;
	const BELOW_FRAMES_TO_END = 110;
	const CALIBRATION_MS = 400;

	const tick = () => {
		if (stopped) return;
		analyser.getByteTimeDomainData(buf);
		let sumSq = 0;
		for (let i = 0; i < buf.length; i++) {
			const x = (buf[i] - 128) / 128;
			sumSq += x * x;
		}
		const rms = Math.sqrt(sumSq / buf.length);

		const now = performance.now();
		if (firstSeenAt === 0) firstSeenAt = now;

		if (calibrating) {
			calibration.push(rms);
			if (now - firstSeenAt > CALIBRATION_MS) {
				calibrating = false;
				const sorted = [...calibration].sort((a, b) => a - b);
				const median = sorted[Math.floor(sorted.length / 2)] ?? 0;
				speechMin = Math.max(median * 2.5, 0.012);
				if (median > 0.04 && !noisyEmitted) {
					noisyEmitted = true;
					handlers.onNoisyEnvironment?.();
				}
			}
		} else if (rms > speechMin) {
			belowFrames = 0;
			aboveFrames++;
			if (!speaking && aboveFrames >= ABOVE_FRAMES_TO_START) {
				speaking = true;
				handlers.onSpeechStart?.();
			}
		} else {
			aboveFrames = 0;
			if (speaking) {
				belowFrames++;
				if (belowFrames >= BELOW_FRAMES_TO_END) {
					speaking = false;
					belowFrames = 0;
					handlers.onSpeechEnd?.();
				}
			}
		}
		requestAnimationFrame(tick);
	};
	requestAnimationFrame(tick);

	return {
		stop: () => {
			if (stopped) return;
			stopped = true;
			try {
				source.disconnect();
			} catch {
				/* ignore */
			}
			try {
				analyser.disconnect();
			} catch {
				/* ignore */
			}
			void ctx.close().catch(() => {});
			stream.getTracks().forEach((t) => t.stop());
		}
	};
}

function pickBestTranscript(result: SpeechRecognitionResult): string {
	let best = '';
	let bestScore = -Infinity;
	for (let j = 0; j < result.length; j++) {
		const alt = result[j];
		const raw = alt.transcript ?? '';
		const t = raw.trim();
		if (!t) continue;
		const conf =
			typeof alt.confidence === 'number' && Number.isFinite(alt.confidence) ? alt.confidence : 0;
		const score = conf + t.length * 1e-6;
		if (score > bestScore) {
			bestScore = score;
			best = raw;
		}
	}
	if (best.trim()) return best.trim();
	return (result[0]?.transcript ?? '').trim();
}

export type GermanDictationOptions = {
	/** BCP 47 tag; default `de-DE`. */
	lang?: string;
	/**
	 * Runs a lightweight RMS-based VAD on a second mic capture so timers survive
	 * rooms where the cloud recogniser emits sparse transcripts. Some setups see
	 * worse accuracy when two captures are open — disable if German STT feels off.
	 * Default true when any VAD handler is passed.
	 */
	enableParallelVad?: boolean;
};

/**
 * Stream German speech-to-text into handlers. Call returned `stop()` when done.
 * Uses restart-on-end while active so pauses do not kill a long answer (Chrome quirk).
 */
export function startGermanDictation(
	handlers: DictationHandlers,
	options?: GermanDictationOptions
): DictationControl {
	const Ctor = getSpeechRecognitionCtor();
	if (!Ctor) {
		handlers.onError(
			'Speech recognition is not available in this browser. Try Chrome or Edge, or use Writing mode.'
		);
		handlers.onStopped();
		return { stop: () => {} };
	}

	let active = true;
	let stoppedNotified = false;
	let vadCtl: { stop: () => void } | null = null;
	const disposeVad = () => {
		vadCtl?.stop();
		vadCtl = null;
	};
	const notifyStopped = () => {
		if (stoppedNotified) return;
		stoppedNotified = true;
		disposeVad();
		handlers.onStopped();
	};

	const vadWanted = !!(
		handlers.onSpeechStart ||
		handlers.onSpeechEnd ||
		handlers.onNoisyEnvironment
	);
	const wantVad = vadWanted && options?.enableParallelVad !== false;
	if (wantVad) {
		void startVad(handlers)
			.then((c) => {
				if (!active || stoppedNotified) {
					c?.stop();
					return;
				}
				vadCtl = c;
			})
			.catch(() => {
				/* VAD is best-effort; recogniser still works without it. */
			});
	}

	const rec = new Ctor();
	rec.lang = options?.lang?.trim() || 'de-DE';
	rec.continuous = true;
	rec.interimResults = true;
	try {
		rec.maxAlternatives = 5;
	} catch {
		/* older engines omit this property */
	}

	const humanError = (code: string): string => {
		switch (code) {
			case 'not-allowed':
				return 'Microphone access was blocked. Allow the mic for this site in your browser settings.';
			case 'no-speech':
				return 'No speech detected. Try again a bit closer to the mic.';
			case 'audio-capture':
				return 'No microphone found or it is in use by another app.';
			case 'network':
				return 'Speech recognition needs a network connection in this browser.';
			default:
				return `Speech recognition error: ${code}`;
		}
	};

	rec.onresult = (event: SpeechRecognitionEvent) => {
		const ri = typeof event.resultIndex === 'number' ? event.resultIndex : 0;
		let interim = '';
		let finalChunk = '';
		for (let i = ri; i < event.results.length; i++) {
			const r = event.results[i];
			const piece = pickBestTranscript(r);
			if (!piece) continue;
			if (r.isFinal) {
				finalChunk = finalChunk ? `${finalChunk} ${piece}` : piece;
			} else {
				interim = interim ? `${interim} ${piece}` : piece;
			}
		}
		const trimmedFinal = finalChunk.trim();
		if (trimmedFinal) handlers.onFinal(trimmedFinal);
		handlers.onInterim(interim.trim());
	};

	rec.onerror = (event: SpeechRecognitionErrorEvent) => {
		if (event.error === 'aborted') return;
		// Non-fatal: Chrome throws this after a short silence; let `onend` restart the session
		// while `active` is still true so continuous listening keeps working.
		if (event.error === 'no-speech') return;
		active = false;
		try {
			rec.stop();
		} catch {
			/* ignore */
		}
		handlers.onError(humanError(event.error));
	};

	let restartAttempts = 0;
	const MAX_QUICK_RESTARTS = 6;
	let restartTimer: ReturnType<typeof setTimeout> | null = null;

	const clearRestartTimer = () => {
		if (restartTimer !== null) {
			clearTimeout(restartTimer);
			restartTimer = null;
		}
	};

	const tryStart = () => {
		clearRestartTimer();
		if (!active) {
			notifyStopped();
			return;
		}
		try {
			rec.start();
			restartAttempts = 0;
		} catch (err) {
			const name = (err as { name?: string } | null)?.name ?? '';
			if (name === 'InvalidStateError') {
				// Previous session not yet released — wait briefly and try again.
				restartTimer = setTimeout(tryStart, 200);
				return;
			}
			restartAttempts += 1;
			if (restartAttempts <= MAX_QUICK_RESTARTS) {
				restartTimer = setTimeout(tryStart, 200 * restartAttempts);
			} else {
				active = false;
				handlers.onError('Microphone stopped. Tap Start to resume.');
				notifyStopped();
			}
		}
	};

	rec.onend = () => {
		if (!active) {
			notifyStopped();
			return;
		}
		// Chrome/iOS can fire `onend` after every utterance even with continuous=true.
		// Restart on a small delay so the audio pipeline fully releases before re-arming
		// (also keeps mobile from churning the mic on every short pause).
		restartTimer = setTimeout(tryStart, 250);
	};

	try {
		rec.start();
		handlers.onReady?.();
	} catch (err) {
		const name = (err as { name?: string } | null)?.name ?? '';
		if (name === 'InvalidStateError') {
			restartTimer = setTimeout(tryStart, 200);
			return {
				stop: () => {
					active = false;
					clearRestartTimer();
					disposeVad();
					try {
						rec.stop();
					} catch {
						/* ignore */
					}
				}
			};
		}
		active = false;
		handlers.onError('Could not start the microphone. Check permissions and try again.');
		notifyStopped();
		return { stop: () => {} };
	}

	return {
		stop: () => {
			active = false;
			clearRestartTimer();
			disposeVad();
			try {
				rec.stop();
			} catch {
				/* ignore */
			}
		}
	};
}
