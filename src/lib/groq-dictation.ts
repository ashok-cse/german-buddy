import type { DictationControl, DictationHandlers } from '$lib/speech-recognition';

const MIC_CONSTRAINTS: MediaTrackConstraints = {
	noiseSuppression: true,
	echoCancellation: true,
	autoGainControl: true
};

/** Shorter hangover than browser Web Speech + legacy VAD — snappier phrase commits for Whisper. */
const BELOW_FRAMES_TO_END = 58;

function pickRecorderMime(): string | undefined {
	if (typeof MediaRecorder === 'undefined') return undefined;
	if (MediaRecorder.isTypeSupported?.('audio/webm;codecs=opus')) return 'audio/webm;codecs=opus';
	if (MediaRecorder.isTypeSupported?.('audio/webm')) return 'audio/webm';
	return undefined;
}

/**
 * Phrase-at-a-time dictation via Groq Whisper (`/api/transcribe`). One shared mic stream:
 * RMS VAD segments utterances, each segment is transcribed as German.
 */
export function startGroqGermanDictation(handlers: DictationHandlers): DictationControl {
	if (typeof window === 'undefined' || typeof MediaRecorder === 'undefined') {
		handlers.onError('Recording is not supported in this browser.');
		handlers.onStopped();
		return { stop: () => {} };
	}

	let active = true;
	let stoppedNotified = false;
	let stream: MediaStream | null = null;
	let ctx: AudioContext | null = null;
	let raf = 0;
	let mediaRecorder: MediaRecorder | null = null;
	let chunks: Blob[] = [];
	const notifyStopped = () => {
		if (stoppedNotified) return;
		stoppedNotified = true;
		cancelAnimationFrame(raf);
		if (mediaRecorder && mediaRecorder.state !== 'inactive') {
			try {
				mediaRecorder.stop();
			} catch {
				/* ignore */
			}
		}
		mediaRecorder = null;
		try {
			ctx?.close();
		} catch {
			/* ignore */
		}
		ctx = null;
		stream?.getTracks().forEach((t) => t.stop());
		stream = null;
		handlers.onStopped();
	};

	const runTranscribe = async (blob: Blob) => {
		if (!active || blob.size < 800) return;
		handlers.onInterim('…');
		try {
			const fd = new FormData();
			fd.append('audio', blob, 'chunk.webm');
			fd.append('language', 'de');
			const res = await fetch('/api/transcribe', {
				method: 'POST',
				body: fd,
				cache: 'no-store'
			});
			if (!res.ok) {
				const t = await res.text();
				throw new Error(t.slice(0, 200) || String(res.status));
			}
			const data = (await res.json()) as { text?: string };
			const text = typeof data?.text === 'string' ? data.text.trim() : '';
			if (text && active) handlers.onFinal(text);
			if (active) handlers.onInterim('');
		} catch (e) {
			const msg = e instanceof Error ? e.message : 'Transcription failed';
			if (active) handlers.onError(msg);
			if (active) handlers.onInterim('');
		}
	};

	void (async () => {
		try {
			stream = await navigator.mediaDevices.getUserMedia({ audio: MIC_CONSTRAINTS });
		} catch {
			if (active) handlers.onError('Microphone access was denied or no mic is available.');
			notifyStopped();
			return;
		}

		const w = window as Window & { webkitAudioContext?: typeof AudioContext };
		const AudioCtx = window.AudioContext ?? w.webkitAudioContext;
		if (!AudioCtx) {
			if (active) handlers.onError('Audio engine not available.');
			notifyStopped();
			return;
		}

		try {
			ctx = new AudioCtx();
		} catch {
			if (active) handlers.onError('Could not open audio context.');
			stream.getTracks().forEach((t) => t.stop());
			stream = null;
			notifyStopped();
			return;
		}

		const source = ctx.createMediaStreamSource(stream);
		const analyser = ctx.createAnalyser();
		analyser.fftSize = 1024;
		source.connect(analyser);
		const buf = new Uint8Array(analyser.fftSize);

		let calibrating = true;
		const calibration: number[] = [];
		let speechMin = 0.012;
		let aboveFrames = 0;
		let belowFrames = 0;
		let speaking = false;
		let firstSeenAt = 0;
		const ABOVE_FRAMES_TO_START = 3;

		const mime = pickRecorderMime();

		const startSegment = () => {
			if (!active || !stream) return;
			try {
				chunks = [];
				mediaRecorder = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream);
				mediaRecorder.ondataavailable = (e) => {
					if (e.data.size > 0) chunks.push(e.data);
				};
				mediaRecorder.start();
			} catch {
				/* ignore */
			}
		};

		const endSegment = () => {
			const rec = mediaRecorder;
			if (!rec || rec.state === 'inactive') return;
			const finishBlob = () => {
				const type = rec.mimeType || 'audio/webm';
				const blob = new Blob(chunks, { type });
				chunks = [];
				mediaRecorder = null;
				void runTranscribe(blob);
			};
			rec.addEventListener('stop', finishBlob, { once: true });
			try {
				rec.stop();
			} catch {
				finishBlob();
			}
		};

		const tick = () => {
			if (!active || stoppedNotified) return;
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
				if (now - firstSeenAt > 400) {
					calibrating = false;
					const sorted = [...calibration].sort((a, b) => a - b);
					const median = sorted[Math.floor(sorted.length / 2)] ?? 0;
					speechMin = Math.max(median * 2.5, 0.012);
				}
			} else if (rms > speechMin) {
				belowFrames = 0;
				aboveFrames++;
				if (!speaking && aboveFrames >= ABOVE_FRAMES_TO_START) {
					speaking = true;
					startSegment();
				}
			} else {
				aboveFrames = 0;
				if (speaking) {
					belowFrames++;
					if (belowFrames >= BELOW_FRAMES_TO_END) {
						speaking = false;
						belowFrames = 0;
						endSegment();
					}
				}
			}
			raf = requestAnimationFrame(tick);
		};

		raf = requestAnimationFrame(tick);
		handlers.onReady?.();
	})();

	return {
		stop: () => {
			active = false;
			notifyStopped();
		}
	};
}

/** Browser can run Groq path: MediaRecorder + mic. */
export function canUseGroqDictation(): boolean {
	return (
		typeof window !== 'undefined' &&
		typeof navigator !== 'undefined' &&
		!!navigator.mediaDevices?.getUserMedia &&
		typeof MediaRecorder !== 'undefined'
	);
}
