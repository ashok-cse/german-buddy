/**
 * Subset of the Web Speech API used here (DOM lib may omit `SpeechRecognition` in some setups).
 */
type WebSpeechRecognition = {
	lang: string;
	continuous: boolean;
	interimResults: boolean;
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
};

export type DictationControl = { stop: () => void };

/**
 * Stream German speech-to-text into handlers. Call returned `stop()` when done.
 * Uses restart-on-end while active so pauses do not kill a long answer (Chrome quirk).
 */
export function startGermanDictation(handlers: DictationHandlers): DictationControl {
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
	const notifyStopped = () => {
		if (stoppedNotified) return;
		stoppedNotified = true;
		handlers.onStopped();
	};

	const rec = new Ctor();
	rec.lang = 'de-DE';
	rec.continuous = true;
	rec.interimResults = true;

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
		let interim = '';
		let finalChunk = '';
		for (let i = event.resultIndex; i < event.results.length; i++) {
			const r = event.results[i];
			const piece = r[0]?.transcript ?? '';
			if (r.isFinal) {
				finalChunk += piece;
			} else {
				interim += piece;
			}
		}
		const trimmedFinal = finalChunk.trim();
		if (trimmedFinal) handlers.onFinal(trimmedFinal);
		handlers.onInterim(interim.trim());
	};

	rec.onerror = (event: SpeechRecognitionErrorEvent) => {
		if (event.error === 'aborted') return;
		active = false;
		try {
			rec.stop();
		} catch {
			/* ignore */
		}
		handlers.onError(humanError(event.error));
	};

	rec.onend = () => {
		if (!active) {
			notifyStopped();
			return;
		}
		try {
			rec.start();
		} catch {
			active = false;
			notifyStopped();
		}
	};

	try {
		rec.start();
		handlers.onReady?.();
	} catch {
		active = false;
		handlers.onError('Could not start the microphone. Check permissions and try again.');
		notifyStopped();
		return { stop: () => {} };
	}

	return {
		stop: () => {
			active = false;
			try {
				rec.stop();
			} catch {
				/* ignore */
			}
		}
	};
}
