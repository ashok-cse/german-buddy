<script lang="ts">
	import { onDestroy } from 'svelte';
	import { browser } from '$app/environment';
	import type { PracticeCategoryId } from '$lib/practice-catalog';
	import {
		PRACTICE_CATEGORY_HINTS,
		PRACTICE_CATEGORY_LABELS,
		PRACTICE_CATEGORY_ORDER,
		getPracticeItems,
		randomItemIndex
	} from '$lib/practice-catalog';
	import type { CorrectionResult } from '$lib/correction';
	import {
		loadHistory,
		saveHistory,
		prependHistory,
		type HistoryEntry
	} from '$lib/history';
	import {
		startGermanDictation,
		getSpeechRecognitionCtor,
		ensureMicPermission,
		type DictationControl
	} from '$lib/speech-recognition';
	import { speak, speakGerman } from '$lib/german-tts';
	import {
		CONVERSATION_SCENARIOS,
		CONVERSATION_STYLES,
		CONVERSATION_STYLE_HINTS,
		CONVERSATION_STYLE_LABELS,
		GERMAN_LEVELS,
		GERMAN_LEVEL_HINTS,
		getScenarioById,
		type ConversationMessage,
		type ConversationStyle,
		type ConversationTurnResult,
		type GermanLevel,
		type WordCorrection
	} from '$lib/conversation';
	import { diffChars } from '$lib/diff-chars';

	type PracticeMode = 'write' | 'speak' | 'chat';

	let practiceMode = $state<PracticeMode>('write');
	let categoryId = $state<PracticeCategoryId>('daily');
	let itemIndex = $state(randomItemIndex('daily'));
	let answer = $state('');
	let loading = $state(false);
	let errorMessage = $state<string | null>(null);
	let result = $state<CorrectionResult | null>(null);
	let history = $state<HistoryEntry[]>([]);

	let listening = $state(false);
	let liveTranscript = $state('');
	let speechSupported = $state(false);
	let dictation: DictationControl | null = null;

	type ChatPhase = 'idle' | 'connecting' | 'listening' | 'thinking' | 'speaking';

	let chatMessages = $state<ConversationMessage[]>([]);
	let chatLoading = $state(false);
	let chatError = $state<string | null>(null);
	let chatLastCorrection = $state<string | null>(null);
	let chatLastCorrections = $state<WordCorrection[]>([]);
	let chatLastExplanation = $state<string | null>(null);
	let chatLastPronunciation = $state<string | null>(null);

	let chatSessionActive = $state(false);
	let chatPhase = $state<ChatPhase>('idle');
	let chatLiveTranscript = $state('');
	let chatBuffer = $state('');
	let chatDictation: DictationControl | null = null;
	let chatSilenceTimer: ReturnType<typeof setTimeout> | null = null;
	let chatRestartTimer: ReturnType<typeof setTimeout> | null = null;
	let lastAssistantText = '';
	let chatEchoGuardUntil = 0;
	const CHAT_SILENCE_MS = 1500;
	/** Wait after TTS ends before re-listening so the mic doesn't catch the AI's own voice tail. */
	const CHAT_RESUME_DELAY_MS = 900;
	/** Only filter incoming audio as echo for this short window after listening starts. */
	const CHAT_ECHO_WINDOW_MS = 1500;

	let chatLevel = $state<GermanLevel>('A2');
	let chatScenarioId = $state<string>(CONVERSATION_SCENARIOS[0].id);
	let chatStyle = $state<ConversationStyle>('roleplay');
	let chatLastTarget = $state<string | null>(null);
	let micPermissionAsked = $state(false);
	let lastUserUtterance = '';
	const currentScenario = $derived(getScenarioById(chatScenarioId) ?? CONVERSATION_SCENARIOS[0]);

	const GERMAN_RATE_BY_LEVEL: Record<GermanLevel, number> = {
		A1: 0.62,
		A2: 0.74,
		B1: 0.84,
		B2: 0.92
	};
	const ENGLISH_RATE_BY_LEVEL: Record<GermanLevel, number> = {
		A1: 0.88,
		A2: 0.94,
		B1: 1,
		B2: 1
	};
	const chatGermanRate = $derived(GERMAN_RATE_BY_LEVEL[chatLevel]);
	const chatEnglishRate = $derived(ENGLISH_RATE_BY_LEVEL[chatLevel]);

	$effect(() => {
		if (!browser) return;
		history = loadHistory();
	});

	$effect(() => {
		if (!browser) return;
		speechSupported = !!getSpeechRecognitionCtor();
	});

	$effect(() => {
		if (practiceMode !== 'speak') stopDictation();
		if (practiceMode !== 'chat') endChatSession();
	});

	const currentItem = $derived.by(() => {
		const items = getPracticeItems(categoryId);
		return items[itemIndex] ?? items[0];
	});
	const currentPrompt = $derived(currentItem.prompt);

	function stopDictation(): void {
		dictation?.stop();
		dictation = null;
		listening = false;
		liveTranscript = '';
	}

	function clearChatSilenceTimer(): void {
		if (chatSilenceTimer) {
			clearTimeout(chatSilenceTimer);
			chatSilenceTimer = null;
		}
	}

	function clearChatRestartTimer(): void {
		if (chatRestartTimer) {
			clearTimeout(chatRestartTimer);
			chatRestartTimer = null;
		}
	}

	function stopChatDictation(): void {
		clearChatSilenceTimer();
		clearChatRestartTimer();
		chatDictation?.stop();
		chatDictation = null;
		chatLiveTranscript = '';
	}

	/** Strip punctuation/whitespace and lowercase for fuzzy echo comparison. */
	function normalizeForEcho(s: string): string {
		return s
			.toLowerCase()
			.replace(/[^\p{Letter}\p{Number}]+/gu, ' ')
			.trim();
	}

	function looksLikeEchoOfAssistant(text: string): boolean {
		if (Date.now() >= chatEchoGuardUntil) return false;
		const said = normalizeForEcho(lastAssistantText);
		if (!said) return false;
		const heard = normalizeForEcho(text);
		if (!heard || heard.length < 4) return false;
		if (said === heard) return true;
		if (said.length > 10 && said.includes(heard)) return true;
		const sw = new Set(said.split(' ').filter((w) => w.length >= 3));
		const hw = heard.split(' ').filter((w) => w.length >= 3);
		if (hw.length === 0) return false;
		const overlap = hw.filter((w) => sw.has(w)).length / hw.length;
		return overlap >= 0.75;
	}

	function cancelTts(): void {
		if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
			window.speechSynthesis.cancel();
		}
	}

	async function startSpeaking(): Promise<void> {
		if (listening || !speechSupported) return;
		errorMessage = null;
		liveTranscript = '';
		const ok = await ensureMicPermission();
		micPermissionAsked = true;
		if (!ok) {
			errorMessage =
				'Microphone access was blocked. Allow the mic for this site in your browser settings, then tap Start again.';
			return;
		}
		dictation = startGermanDictation({
			onFinal: (text) => {
				const base = answer.trimEnd();
				answer = base ? `${base} ${text}` : text;
				liveTranscript = '';
			},
			onInterim: (t) => {
				liveTranscript = t;
			},
			onError: (msg) => {
				errorMessage = msg;
			},
			onReady: () => {
				listening = true;
			},
			onStopped: () => {
				listening = false;
				dictation = null;
				liveTranscript = '';
			}
		});
	}

	onDestroy(() => stopDictation());
	onDestroy(() => endChatSession());

	function setCategory(id: PracticeCategoryId): void {
		if (id === categoryId) return;
		stopDictation();
		categoryId = id;
		itemIndex = randomItemIndex(id);
		answer = '';
		result = null;
		errorMessage = null;
	}

	function newPrompt(): void {
		stopDictation();
		endChatSession();
		const nextIdx = randomItemIndex(categoryId, itemIndex);
		itemIndex = nextIdx;
		errorMessage = null;
		result = null;
		const items = getPracticeItems(categoryId);
		const nextText = items[nextIdx]?.prompt ?? items[0].prompt;
		if (practiceMode === 'speak' && ttsSupported) speakGerman(nextText);
	}

	async function correct(): Promise<void> {
		const trimmed = answer.trim();
		if (!trimmed) {
			errorMessage =
				practiceMode === 'speak'
					? 'Bitte nimm etwas auf oder schreib etwas auf Deutsch.'
					: 'Bitte schreib zuerst etwas auf Deutsch.';
			return;
		}
		loading = true;
		errorMessage = null;
		result = null;
		try {
			const res = await fetch('/api/correct', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ prompt: currentPrompt, answer: trimmed })
			});
			if (!res.ok) {
				const text = await res.text();
				let message = text.slice(0, 400) || 'Request failed';
				try {
					const j = JSON.parse(text) as { message?: unknown };
					if (typeof j?.message === 'string') message = j.message;
				} catch {
					/* plain text body */
				}
				errorMessage = message;
				return;
			}
			const data = (await res.json()) as CorrectionResult;
			result = data;
			const entry: HistoryEntry = {
				prompt: currentPrompt,
				original: data.original,
				corrected: data.corrected,
				timestamp: Date.now()
			};
			history = prependHistory(history, entry);
			saveHistory(history);
		} catch {
			errorMessage = 'Netzwerkfehler. Bitte Verbindung prüfen und erneut versuchen.';
		} finally {
			loading = false;
		}
	}

	async function startChatSession(): Promise<void> {
		if (chatSessionActive) return;
		chatError = null;
		const ok = await ensureMicPermission();
		micPermissionAsked = true;
		if (!ok) {
			chatError =
				'Microphone access was blocked. Allow the mic for this site in your browser settings, then tap Start conversation again.';
			return;
		}
		chatSessionActive = true;
		chatLastCorrection = null;
		chatLastCorrections = [];
		chatLastExplanation = null;
		chatLastPronunciation = null;
		chatLastTarget = null;
		chatMessages = [];
		chatBuffer = '';
		chatLiveTranscript = '';
		lastAssistantText = '';
		lastUserUtterance = '';
		await fetchAssistantTurn([]);
	}

	function endChatSession(): void {
		chatSessionActive = false;
		chatPhase = 'idle';
		chatBuffer = '';
		lastAssistantText = '';
		stopChatDictation();
		cancelTts();
	}

	function setChatLevel(lvl: GermanLevel): void {
		if (chatLevel === lvl) return;
		chatLevel = lvl;
		if (chatSessionActive) endChatSession();
	}

	function setChatScenario(id: string): void {
		if (chatScenarioId === id) return;
		chatScenarioId = id;
		if (chatSessionActive) endChatSession();
	}

	function setChatStyle(style: ConversationStyle): void {
		if (chatStyle === style) return;
		chatStyle = style;
		if (chatSessionActive) endChatSession();
	}

	function scheduleAutoSubmit(): void {
		clearChatSilenceTimer();
		chatSilenceTimer = setTimeout(() => {
			chatSilenceTimer = null;
			void submitUserTurn();
		}, CHAT_SILENCE_MS);
	}

	function beginListening(): void {
		if (!chatSessionActive || !speechSupported) return;
		stopChatDictation();
		chatBuffer = '';
		chatLiveTranscript = '';
		chatPhase = 'listening';
		chatEchoGuardUntil = Date.now() + CHAT_ECHO_WINDOW_MS;
		chatDictation = startGermanDictation({
			onFinal: (text) => {
				const t = text.trim();
				if (!t) return;
				if (looksLikeEchoOfAssistant(t)) return;
				chatEchoGuardUntil = 0;
				chatBuffer = chatBuffer ? `${chatBuffer} ${t}` : t;
				chatLiveTranscript = '';
				scheduleAutoSubmit();
			},
			onInterim: (t) => {
				const trimmed = t.trim();
				if (!trimmed) return;
				if (looksLikeEchoOfAssistant(trimmed)) return;
				chatEchoGuardUntil = 0;
				if (trimmed !== chatLiveTranscript) chatLiveTranscript = trimmed;
				scheduleAutoSubmit();
			},
			onError: (msg) => {
				chatError = msg;
			},
			onStopped: () => {
				chatDictation = null;
				chatLiveTranscript = '';
				if (
					chatSessionActive &&
					!chatError &&
					!chatLoading &&
					chatPhase === 'listening' &&
					speechSupported
				) {
					scheduleResumeListening();
				}
			}
		});
	}

	function scheduleResumeListening(): void {
		clearChatRestartTimer();
		chatRestartTimer = setTimeout(() => {
			chatRestartTimer = null;
			if (chatSessionActive && speechSupported) beginListening();
		}, CHAT_RESUME_DELAY_MS);
	}

	/**
	 * Play German for a "Hear it" tap. Pauses the mic during playback so the
	 * recogniser does not capture the TTS audio as user speech, then resumes
	 * listening when speech ends (if a session is active).
	 */
	function hearGerman(text: string): void {
		const trimmed = text.trim();
		if (!trimmed || !ttsSupported) return;
		const wasInSession = chatSessionActive;
		stopChatDictation();
		clearChatSilenceTimer();
		clearChatRestartTimer();
		lastAssistantText = `${lastAssistantText} ${trimmed}`.trim();
		if (wasInSession) chatPhase = 'speaking';
		speakGerman(trimmed, {
			rate: chatGermanRate,
			onEnd: () => {
				if (!chatSessionActive) {
					if (wasInSession) chatPhase = 'idle';
					return;
				}
				if (speechSupported) scheduleResumeListening();
				else chatPhase = 'idle';
			}
		});
	}

	function playAssistantTurn(englishOrGerman: string, germanTarget: string): void {
		const onAllDone = () => {
			if (!chatSessionActive) return;
			if (speechSupported) scheduleResumeListening();
			else chatPhase = 'idle';
		};

		if (chatStyle === 'tutor') {
			const playGerman = () => {
				if (!chatSessionActive) return;
				if (germanTarget)
					speakGerman(germanTarget, { rate: chatGermanRate, onEnd: onAllDone });
				else onAllDone();
			};
			if (englishOrGerman)
				speak(englishOrGerman, 'en-US', { rate: chatEnglishRate, onEnd: playGerman });
			else playGerman();
		} else {
			speakGerman(englishOrGerman, { rate: chatGermanRate, onEnd: onAllDone });
		}
	}

	async function submitUserTurn(): Promise<void> {
		clearChatSilenceTimer();
		const text = (chatBuffer + (chatLiveTranscript ? ` ${chatLiveTranscript}` : '')).trim();
		chatBuffer = '';
		chatLiveTranscript = '';
		stopChatDictation();
		if (!text || !chatSessionActive) {
			if (chatSessionActive) beginListening();
			return;
		}
		// Drop duplicate captures (mic restart re-emitting same final, or echo of previous turn).
		if (normalizeForEcho(text) === lastUserUtterance) {
			if (chatSessionActive && speechSupported) scheduleResumeListening();
			return;
		}
		lastUserUtterance = normalizeForEcho(text);
		const next = [...chatMessages, { role: 'user', content: text } satisfies ConversationMessage];
		chatMessages = next;
		chatLastCorrection = null;
		chatLastCorrections = [];
		chatLastExplanation = null;
		chatLastPronunciation = null;
		chatLastTarget = null;
		await fetchAssistantTurn(next);
	}

	async function fetchAssistantTurn(history: ConversationMessage[]): Promise<void> {
		chatLoading = true;
		chatPhase = history.length === 0 ? 'connecting' : 'thinking';
		chatError = null;
		try {
			const res = await fetch('/api/converse', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					level: chatLevel,
					style: chatStyle,
					scenario: currentScenario.setup,
					messages: history
				})
			});
			if (!res.ok) {
				const text = await res.text();
				let message = text.slice(0, 400) || 'Request failed';
				try {
					const j = JSON.parse(text) as { message?: unknown };
					if (typeof j?.message === 'string') message = j.message;
				} catch {
					/* plain text body */
				}
				chatError = message;
				if (chatSessionActive && speechSupported) beginListening();
				return;
			}
			const data = (await res.json()) as ConversationTurnResult;
			const assistantText = (data?.assistant ?? '').trim();
			const germanTarget =
				typeof data?.germanTarget === 'string' && data.germanTarget.trim()
					? data.germanTarget.trim()
					: '';
			chatLastCorrection =
				typeof data?.correctedUser === 'string' && data.correctedUser.trim()
					? data.correctedUser.trim()
					: null;
			chatLastCorrections = Array.isArray(data?.corrections)
				? data.corrections
						.filter(
							(c): c is WordCorrection =>
								!!c &&
								typeof c.wrong === 'string' &&
								typeof c.right === 'string' &&
								c.wrong.trim().length > 0 &&
								c.right.trim().length > 0 &&
								c.wrong.trim() !== c.right.trim()
						)
						.map((c) => ({
							wrong: c.wrong.trim(),
							right: c.right.trim(),
							note: typeof c.note === 'string' && c.note.trim() ? c.note.trim() : undefined
						}))
				: [];
			chatLastExplanation =
				typeof data?.explanation === 'string' && data.explanation.trim()
					? data.explanation.trim()
					: null;
			chatLastPronunciation =
				typeof data?.pronunciation === 'string' && data.pronunciation.trim()
					? data.pronunciation.trim()
					: null;
			chatLastTarget = germanTarget || null;

			const transcriptForChat =
				chatStyle === 'tutor' && germanTarget
					? `${assistantText}\n\n→ ${germanTarget}`
					: assistantText;

			if (assistantText || germanTarget) {
				chatMessages = [
					...history,
					{ role: 'assistant', content: transcriptForChat || germanTarget }
				];
				lastAssistantText = `${assistantText} ${germanTarget}`.trim();
				if (chatSessionActive && ttsSupported) {
					chatPhase = 'speaking';
					playAssistantTurn(assistantText, germanTarget);
				} else if (chatSessionActive && speechSupported) {
					scheduleResumeListening();
				} else {
					chatPhase = 'idle';
				}
			} else if (chatSessionActive && speechSupported) {
				scheduleResumeListening();
			} else {
				chatPhase = 'idle';
			}
		} catch {
			chatError = 'Netzwerkfehler. Bitte Verbindung prüfen und erneut versuchen.';
			if (chatSessionActive && speechSupported) scheduleResumeListening();
		} finally {
			chatLoading = false;
		}
	}

	async function copyText(text: string): Promise<void> {
		try {
			await navigator.clipboard.writeText(text);
		} catch {
			/* ignore */
		}
	}

	let ttsSupported = $state(false);
	$effect(() => {
		ttsSupported = typeof window !== 'undefined' && 'speechSynthesis' in window;
	});

	function onKeydown(e: KeyboardEvent): void {
		if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
			e.preventDefault();
			void correct();
		}
	}
</script>

<svelte:head>
	<title>German Mirror — daily practice</title>
	<meta
		name="description"
		content="German writing and speaking practice: dictate or type, then get instant corrections."
	/>
</svelte:head>

<main
	class="mx-auto flex min-h-dvh max-w-3xl flex-col gap-8 px-4 py-10 pb-16 text-stone-800 sm:px-6"
>
	<header class="space-y-2">
		<div class="flex items-start justify-between gap-4">
			<p class="text-xs font-medium uppercase tracking-wide text-stone-500">Day-one practice</p>
			<form method="POST" action="/logout" class="shrink-0">
				<button
					type="submit"
					class="text-xs font-medium text-stone-500 hover:text-stone-900 transition-colors"
				>
					Sign out
				</button>
			</form>
		</div>
		<h1 class="text-3xl font-semibold tracking-tight text-stone-900 sm:text-4xl">German Buddy</h1>
		<p class="max-w-2xl text-base leading-relaxed text-stone-600">
			Pick a topic, then answer in German — by typing or by speaking — and get corrections. Numbers and alphabet
			include an optional example line you can hear for pronunciation.
		</p>
		{#if practiceMode !== 'chat'}
			<div class="space-y-2">
				<p class="text-xs font-medium uppercase tracking-wide text-stone-500">Topic</p>
				<div
					class="flex flex-wrap gap-1 rounded-xl border border-stone-200 bg-stone-100/90 p-1 shadow-inner"
					role="group"
					aria-label="Practice topic"
				>
					{#each PRACTICE_CATEGORY_ORDER as cid (cid)}
						<button
							type="button"
							class="min-w-0 flex-1 rounded-lg px-2.5 py-2 text-xs font-medium transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stone-400 sm:flex-none sm:px-3 sm:text-sm {categoryId ===
							cid
								? 'bg-white text-stone-900 shadow-sm'
								: 'text-stone-600 hover:text-stone-900'}"
							onclick={() => setCategory(cid)}
						>
							{PRACTICE_CATEGORY_LABELS[cid]}
						</button>
					{/each}
				</div>
				<p class="text-xs leading-relaxed text-stone-500">{PRACTICE_CATEGORY_HINTS[categoryId]}</p>
			</div>
		{/if}
		<div
			class="flex max-w-md rounded-xl border border-stone-200 bg-stone-100/90 p-1 shadow-inner"
			role="group"
			aria-label="Practice mode"
		>
			<button
				type="button"
				class="flex-1 rounded-lg px-3 py-2 text-sm font-medium transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stone-400 {practiceMode ===
				'write'
					? 'bg-white text-stone-900 shadow-sm'
					: 'text-stone-600 hover:text-stone-900'}"
				onclick={() => {
					practiceMode = 'write';
				}}
			>
				Writing
			</button>
			<button
				type="button"
				disabled={!speechSupported}
				title={!speechSupported ? 'Use Chrome or Edge for speech recognition' : undefined}
				class="flex-1 rounded-lg px-3 py-2 text-sm font-medium transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stone-400 disabled:cursor-not-allowed disabled:opacity-50 {practiceMode ===
				'speak'
					? 'bg-white text-stone-900 shadow-sm'
					: 'text-stone-600 hover:text-stone-900'}"
				onclick={() => {
					practiceMode = 'speak';
				}}
			>
				Speaking
			</button>
			<button
				type="button"
				disabled={!speechSupported}
				title={!speechSupported ? 'Use Chrome or Edge for speech recognition' : undefined}
				class="flex-1 rounded-lg px-3 py-2 text-sm font-medium transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stone-400 disabled:cursor-not-allowed disabled:opacity-50 {practiceMode ===
				'chat'
					? 'bg-white text-stone-900 shadow-sm'
					: 'text-stone-600 hover:text-stone-900'}"
				onclick={() => {
					practiceMode = 'chat';
				}}
			>
				Conversation
			</button>
		</div>
		{#if (practiceMode === 'speak' || practiceMode === 'chat') && !speechSupported}
			<p class="text-sm text-amber-800/90">
				Speech-to-text needs a supported browser (e.g. Chrome or Edge). You can still use Writing mode.
			</p>
		{/if}
	</header>

	{#if practiceMode !== 'chat'}
	<section class="rounded-2xl border border-stone-200/80 bg-white p-5 shadow-sm sm:p-6" aria-label="Prompt">
		<div class="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
			<div class="space-y-3">
				<div class="flex flex-wrap items-center gap-2">
					<h2 class="text-sm font-semibold text-stone-900">Task</h2>
					<span
						class="rounded-full border border-stone-200 bg-stone-50 px-2 py-0.5 text-xs font-medium text-stone-600"
					>
						{PRACTICE_CATEGORY_LABELS[categoryId]}
					</span>
				</div>
				<p class="text-lg leading-relaxed text-stone-800">{currentPrompt}</p>
				{#if currentItem.learnText}
					<div
						class="rounded-xl border border-emerald-100 bg-emerald-50/70 px-3 py-3 text-sm text-emerald-950"
					>
						<p class="text-xs font-semibold uppercase tracking-wide text-emerald-900/70">Example / pronunciation</p>
						<p class="mt-1.5 leading-relaxed text-emerald-950">{currentItem.learnText}</p>
						{#if ttsSupported}
							<button
								type="button"
								class="mt-2 inline-flex items-center gap-2 rounded-lg border border-emerald-200/80 bg-white px-3 py-1.5 text-xs font-medium text-emerald-900 shadow-sm transition hover:bg-emerald-50/90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-400"
								aria-label="Listen to example in German"
								onclick={() => speakGerman(currentItem.learnText ?? '')}
							>
								<span class="text-emerald-700" aria-hidden="true">▶</span>
								Listen to example (German)
							</button>
						{/if}
					</div>
				{/if}
				{#if ttsSupported}
					<button
						type="button"
						class="inline-flex items-center gap-2 rounded-xl border border-stone-200 bg-stone-50 px-3 py-2 text-sm font-medium text-stone-800 shadow-sm transition hover:bg-stone-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stone-400"
						aria-label="Listen to prompt in German"
						onclick={() => speakGerman(currentPrompt)}
					>
						<span class="text-stone-600" aria-hidden="true">▶</span>
						Listen to task (German)
					</button>
				{/if}
				{#if practiceMode === 'speak' && ttsSupported}
					<p class="text-xs text-stone-500">
						Tip: Hear the task first, then use <span class="font-medium text-stone-700">Start recording</span> for
						your answer.
					</p>
				{/if}
			</div>
			<button
				type="button"
				class="inline-flex shrink-0 items-center justify-center self-start rounded-xl border border-stone-200 bg-stone-50 px-4 py-2.5 text-sm font-medium text-stone-800 shadow-sm transition hover:bg-stone-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stone-400"
				onclick={newPrompt}
			>
				New prompt
			</button>
		</div>
	</section>
	{/if}

	{#if practiceMode !== 'chat'}
		<section class="space-y-3" aria-label="Your answer">
			<label for="answer" class="text-sm font-semibold text-stone-900">
				{practiceMode === 'speak' ? 'Your answer (spoken or edited)' : 'Your German answer'}
			</label>
			{#if practiceMode === 'speak' && speechSupported}
				<div class="flex flex-wrap items-center gap-3">
					{#if !listening}
						<button
							type="button"
							class="inline-flex items-center gap-2 rounded-xl border border-stone-200 bg-white px-4 py-2.5 text-sm font-medium text-stone-800 shadow-sm transition hover:bg-stone-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stone-400"
							onclick={startSpeaking}
						>
							<span class="h-2.5 w-2.5 rounded-full bg-red-500" aria-hidden="true"></span>
							Start recording
						</button>
					{:else}
						<button
							type="button"
							class="inline-flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-2.5 text-sm font-medium text-red-900 shadow-sm transition hover:bg-red-100/90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-400"
							onclick={stopDictation}
						>
							<span
								class="h-2.5 w-2.5 animate-pulse rounded-full bg-red-600"
								aria-hidden="true"
							></span>
							Stop recording
						</button>
					{/if}
					<p class="text-xs text-stone-500">Speak in German; text fills the box. Edit if needed, then correct.</p>
				</div>
			{/if}
			<textarea
				id="answer"
				bind:value={answer}
				onkeydown={onKeydown}
				rows="7"
				class="w-full resize-y rounded-2xl border border-stone-200 bg-white px-4 py-3 text-base leading-relaxed text-stone-900 shadow-inner outline-none ring-stone-300 transition placeholder:text-stone-400 focus:border-stone-300 focus:ring-2"
				placeholder={practiceMode === 'speak'
					? 'Dein gesprochener Text erscheint hier … Du kannst auch tippen.'
					: 'Schreib hier auf Deutsch …'}
				autocomplete="off"
				spellcheck="true"
				lang="de"
			></textarea>
			{#if practiceMode === 'speak' && liveTranscript}
				<p class="text-sm italic leading-relaxed text-stone-500" aria-live="polite">{liveTranscript}</p>
			{/if}
			{#if practiceMode === 'write'}
				<p class="text-xs text-stone-500">
					Tipp: <kbd class="rounded bg-stone-100 px-1 py-0.5">⌘</kbd> oder
					<kbd class="rounded bg-stone-100 px-1 py-0.5">Strg</kbd> +
					<kbd class="rounded bg-stone-100 px-1 py-0.5">Enter</kbd>
					schickt ab.
				</p>
			{/if}
			<button
				type="button"
				class="inline-flex w-full items-center justify-center rounded-2xl bg-stone-900 px-4 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-stone-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stone-500 disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto sm:min-w-[200px]"
				onclick={() => void correct()}
				disabled={loading}
			>
				{#if loading}
					<span class="inline-flex items-center gap-2">
						<span
							class="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white"
							aria-hidden="true"
						></span>
						Correcting…
					</span>
				{:else}
					Correct my German
				{/if}
			</button>
		</section>
	{:else}
		{@const phaseLabel =
			chatPhase === 'connecting'
				? 'Verbinde …'
				: chatPhase === 'listening'
					? 'Hört zu …'
					: chatPhase === 'thinking'
						? 'Denkt nach …'
						: chatPhase === 'speaking'
							? 'Spricht …'
							: 'Bereit'}
		{@const phaseTone =
			chatPhase === 'listening'
				? 'bg-red-500'
				: chatPhase === 'thinking'
					? 'bg-amber-500'
					: chatPhase === 'speaking'
						? 'bg-emerald-500'
						: chatPhase === 'connecting'
							? 'bg-stone-400'
							: 'bg-stone-300'}
		<section
			class="rounded-2xl border border-stone-200/80 bg-white p-5 shadow-sm sm:p-6"
			aria-label="Conversation practice"
		>
			<div class="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
				<div class="space-y-1">
					<h2 class="text-sm font-semibold text-stone-900">Conversation</h2>
					<p class="text-xs text-stone-500">
						Hands-free 1:1 practice. Pick a level + scenario, tap <span class="font-medium text-stone-700"
							>Start conversation</span
						>, allow the mic when prompted, then just speak.
					</p>
				</div>
				<div class="flex flex-wrap gap-2">
					{#if !chatSessionActive}
						<button
							type="button"
							class="inline-flex items-center justify-center gap-2 rounded-xl bg-stone-900 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-stone-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stone-500 disabled:cursor-not-allowed disabled:opacity-60"
							onclick={() => void startChatSession()}
							disabled={chatLoading || !speechSupported}
							title={!speechSupported ? 'Use Chrome or Edge for speech recognition' : undefined}
						>
							<span class="h-2 w-2 rounded-full bg-emerald-400" aria-hidden="true"></span>
							Start conversation
						</button>
					{:else}
						<button
							type="button"
							class="inline-flex items-center justify-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-2.5 text-sm font-medium text-red-900 shadow-sm transition hover:bg-red-100/90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-400"
							onclick={endChatSession}
						>
							<span class="h-2 w-2 rounded-full bg-red-600" aria-hidden="true"></span>
							End conversation
						</button>
					{/if}
				</div>
			</div>

			<div class="mt-4 space-y-3">
				<div class="space-y-1.5">
					<p class="text-xs font-medium uppercase tracking-wide text-stone-500">Mode</p>
					<div
						class="flex max-w-md rounded-xl border border-stone-200 bg-stone-100/90 p-1 shadow-inner"
						role="group"
						aria-label="Conversation style"
					>
						{#each CONVERSATION_STYLES as st (st)}
							<button
								type="button"
								class="flex-1 rounded-lg px-3 py-1.5 text-sm font-medium transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stone-400 {chatStyle ===
								st
									? 'bg-white text-stone-900 shadow-sm'
									: 'text-stone-600 hover:text-stone-900'}"
								onclick={() => setChatStyle(st)}
							>
								{CONVERSATION_STYLE_LABELS[st]}
							</button>
						{/each}
					</div>
					<p class="text-xs leading-relaxed text-stone-500">{CONVERSATION_STYLE_HINTS[chatStyle]}</p>
				</div>

				<div class="space-y-1.5">
					<p class="text-xs font-medium uppercase tracking-wide text-stone-500">Level</p>
					<div
						class="flex max-w-md rounded-xl border border-stone-200 bg-stone-100/90 p-1 shadow-inner"
						role="group"
						aria-label="German level"
					>
						{#each GERMAN_LEVELS as lvl (lvl)}
							<button
								type="button"
								class="flex-1 rounded-lg px-3 py-1.5 text-sm font-medium transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stone-400 {chatLevel ===
								lvl
									? 'bg-white text-stone-900 shadow-sm'
									: 'text-stone-600 hover:text-stone-900'}"
								onclick={() => setChatLevel(lvl)}
							>
								{lvl}
							</button>
						{/each}
					</div>
					<p class="text-xs leading-relaxed text-stone-500">
						{GERMAN_LEVEL_HINTS[chatLevel]}
						{#if chatLevel === 'A1' || chatLevel === 'A2'}
							<span class="text-stone-600"> · German plays slower at this level.</span>
						{/if}
					</p>
				</div>

				<div class="space-y-1.5">
					<p class="text-xs font-medium uppercase tracking-wide text-stone-500">Scenario</p>
					<div class="flex flex-wrap gap-1.5" role="group" aria-label="Conversation scenario">
						{#each CONVERSATION_SCENARIOS as s (s.id)}
							<button
								type="button"
								class="rounded-lg border px-2.5 py-1.5 text-xs font-medium transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stone-400 {chatScenarioId ===
								s.id
									? 'border-stone-900 bg-stone-900 text-white'
									: 'border-stone-200 bg-white text-stone-700 hover:bg-stone-50'}"
								onclick={() => setChatScenario(s.id)}
							>
								{s.label}
							</button>
						{/each}
					</div>
					<p class="text-xs leading-relaxed text-stone-500">{currentScenario.setup}</p>
				</div>
			</div>

			{#if chatSessionActive}
				<div
					class="mt-4 flex items-center gap-3 rounded-xl border border-stone-200 bg-stone-50/80 px-3 py-2"
					aria-live="polite"
				>
					<span class="flex h-2.5 w-2.5 items-center justify-center" aria-hidden="true">
						<span
							class="h-2.5 w-2.5 rounded-full {phaseTone} {chatPhase === 'listening' ||
							chatPhase === 'speaking' ||
							chatPhase === 'thinking'
								? 'animate-pulse'
								: ''}"
						></span>
					</span>
					<p class="text-sm text-stone-700">{phaseLabel}</p>
					{#if chatPhase === 'listening'}
						<button
							type="button"
							class="ml-auto inline-flex items-center justify-center rounded-lg border border-stone-200 bg-white px-2.5 py-1 text-xs font-medium text-stone-800 shadow-sm transition hover:bg-stone-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stone-400 disabled:cursor-not-allowed disabled:opacity-60"
							onclick={() => void submitUserTurn()}
							disabled={!chatBuffer && !chatLiveTranscript.trim()}
						>
							Send now
						</button>
					{:else if chatPhase === 'speaking'}
						<button
							type="button"
							class="ml-auto inline-flex items-center justify-center rounded-lg border border-stone-200 bg-white px-2.5 py-1 text-xs font-medium text-stone-800 shadow-sm transition hover:bg-stone-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stone-400"
							onclick={() => {
								cancelTts();
								if (speechSupported) scheduleResumeListening();
								else chatPhase = 'idle';
							}}
						>
							Skip
						</button>
					{/if}
				</div>
			{/if}

			<div class="mt-4 space-y-3">
				<div
					class="max-h-[48vh] space-y-3 overflow-auto rounded-2xl border border-stone-200 bg-stone-50/60 p-4"
					aria-label="Chat thread"
				>
					{#if chatMessages.length === 0}
						<p class="text-sm text-stone-500">
							Tap <span class="font-medium text-stone-700">Start conversation</span> — the AI will greet you and
							you can just speak back.
						</p>
					{:else}
						{#each chatMessages as m, i (i)}
							<div class="flex {m.role === 'user' ? 'justify-end' : 'justify-start'}">
								<div
									class="max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-relaxed shadow-sm {m.role ===
									'user'
										? 'bg-stone-900 text-white'
										: 'border border-stone-200 bg-white text-stone-900'}"
								>
									{m.content}
								</div>
							</div>
						{/each}
						{#if chatSessionActive && (chatBuffer || chatLiveTranscript)}
							<div class="flex justify-end">
								<div
									class="max-w-[85%] rounded-2xl border border-stone-300 border-dashed bg-white px-4 py-3 text-sm leading-relaxed text-stone-700 shadow-sm"
								>
									{(chatBuffer + (chatLiveTranscript ? ` ${chatLiveTranscript}` : '')).trim()}
								</div>
							</div>
						{/if}
					{/if}
				</div>

				{#if chatStyle === 'tutor' && chatLastTarget}
					<div
						class="space-y-2 rounded-2xl border border-stone-300 bg-white px-4 py-3 text-sm text-stone-900 shadow-sm"
					>
						<div class="flex flex-wrap items-center justify-between gap-2">
							<p class="text-xs font-semibold uppercase tracking-wide text-stone-500">
								Say this in German
							</p>
							{#if ttsSupported}
								<button
									type="button"
									class="inline-flex items-center gap-1.5 rounded-lg border border-stone-200 bg-stone-50 px-2 py-0.5 text-xs font-medium text-stone-800 shadow-sm transition hover:bg-stone-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stone-400"
									onclick={() => hearGerman(chatLastTarget ?? '')}
								>
									<span class="text-stone-700" aria-hidden="true">▶</span>
									Hear it
								</button>
							{/if}
						</div>
						<p class="text-base font-medium leading-relaxed text-stone-900">{chatLastTarget}</p>
						{#if chatLastPronunciation}
							<p class="font-mono text-xs leading-relaxed text-stone-600">{chatLastPronunciation}</p>
						{/if}
					</div>
				{/if}

				{#if chatLastCorrection || chatLastCorrections.length > 0 || chatLastExplanation || chatLastPronunciation}
					<div
						class="space-y-3 rounded-2xl border border-emerald-100 bg-emerald-50/70 px-4 py-3 text-sm text-emerald-950"
					>
						<p class="text-xs font-semibold uppercase tracking-wide text-emerald-900/70">
							Teacher feedback
						</p>
						{#if chatLastCorrections.length > 0}
							<div class="space-y-2">
								<p class="text-xs font-medium text-emerald-900/80">Word fixes</p>
								<ul class="space-y-1.5">
									{#each chatLastCorrections as c (c.wrong + '→' + c.right)}
										{@const ops = diffChars(c.wrong, c.right)}
										<li class="flex flex-wrap items-baseline gap-x-2 gap-y-1 leading-relaxed">
											<span class="font-mono text-[15px] tracking-tight text-stone-700">
												{#each ops as op, i (i)}
													{#if op.kind === 'equal'}<span>{op.text}</span>
													{:else if op.kind === 'del'}<span
															class="rounded bg-rose-100 px-0.5 font-semibold text-rose-700 line-through decoration-rose-500/70 decoration-2"
															>{op.text}</span
														>
													{/if}
												{/each}
											</span>
											<span class="text-emerald-700/80" aria-hidden="true">→</span>
											<span class="font-mono text-[15px] tracking-tight text-emerald-900">
												{#each ops as op, i (i)}
													{#if op.kind === 'equal'}<span>{op.text}</span>
													{:else if op.kind === 'ins'}<span
															class="rounded bg-emerald-200/80 px-0.5 font-semibold text-emerald-900"
															>{op.text}</span
														>
													{/if}
												{/each}
											</span>
											{#if ttsSupported}
												<button
													type="button"
													class="inline-flex items-center gap-1 rounded-md border border-emerald-200/80 bg-white px-1.5 py-0.5 text-[11px] font-medium text-emerald-900 shadow-sm transition hover:bg-emerald-50/90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-400"
													onclick={() => hearGerman(c.right)}
													aria-label={'Hear ' + c.right}
												>
													<span class="text-emerald-700" aria-hidden="true">▶</span>
												</button>
											{/if}
											{#if c.note}
												<span class="basis-full text-xs text-emerald-900/80">{c.note}</span>
											{/if}
										</li>
									{/each}
								</ul>
							</div>
						{/if}
						{#if chatLastCorrection}
							<div class="space-y-1">
								<div class="flex flex-wrap items-center gap-2">
									<span class="text-xs font-medium text-emerald-900/80">Sag es so</span>
									{#if ttsSupported}
										<button
											type="button"
											class="inline-flex items-center gap-1.5 rounded-lg border border-emerald-200/80 bg-white px-2 py-0.5 text-xs font-medium text-emerald-900 shadow-sm transition hover:bg-emerald-50/90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-400"
											onclick={() => hearGerman(chatLastCorrection ?? '')}
										>
											<span class="text-emerald-700" aria-hidden="true">▶</span>
											Hear it
										</button>
									{/if}
								</div>
								<p class="font-medium leading-relaxed text-emerald-950">{chatLastCorrection}</p>
							</div>
						{/if}
						{#if chatLastPronunciation}
							<div class="space-y-1">
								<p class="text-xs font-medium text-emerald-900/80">Pronunciation</p>
								<p class="font-mono text-xs leading-relaxed text-emerald-900">
									{chatLastPronunciation}
								</p>
							</div>
						{/if}
						{#if chatLastExplanation}
							<div class="space-y-1">
								<p class="text-xs font-medium text-emerald-900/80">Why (English)</p>
								<p class="leading-relaxed text-emerald-950">{chatLastExplanation}</p>
							</div>
						{/if}
					</div>
				{/if}

				{#if chatError}
					<p class="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-900">
						{chatError}
					</p>
				{/if}
			</div>
		</section>
	{/if}

	{#if errorMessage}
		<div
			class="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900"
			role="alert"
		>
			<p class="font-medium">That didn’t work</p>
			<p class="mt-1 text-red-800/90">{errorMessage}</p>
		</div>
	{/if}

	{#if result}
		{@const feedback = result}
		<section class="space-y-4" aria-label="Feedback">
			<h2 class="text-sm font-semibold text-stone-900">Feedback</h2>
			<div class="grid gap-4 sm:grid-cols-2">
				<article class="rounded-2xl border border-stone-200/80 bg-white p-4 shadow-sm sm:col-span-2">
					<h3 class="text-xs font-semibold uppercase tracking-wide text-stone-500">Your answer</h3>
					<p class="mt-2 whitespace-pre-wrap text-base leading-relaxed text-stone-900">{feedback.original}</p>
				</article>

				<article class="rounded-2xl border border-stone-200/80 bg-white p-4 shadow-sm sm:col-span-2">
					<div class="flex flex-wrap items-center justify-between gap-2">
						<h3 class="text-xs font-semibold uppercase tracking-wide text-stone-500">Corrected German</h3>
						<div class="flex flex-wrap gap-2">
							{#if ttsSupported}
								<button
									type="button"
									class="rounded-lg border border-stone-200 bg-stone-50 px-2.5 py-1 text-xs font-medium text-stone-800 hover:bg-stone-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stone-400"
									onclick={() => speakGerman(feedback.corrected)}
								>
									Read aloud
								</button>
							{/if}
							<button
								type="button"
								class="rounded-lg border border-stone-200 bg-stone-50 px-2.5 py-1 text-xs font-medium text-stone-800 hover:bg-stone-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stone-400"
								onclick={() => void copyText(feedback.corrected)}
							>
								Copy
							</button>
						</div>
					</div>
					<p class="mt-2 whitespace-pre-wrap text-base font-medium leading-relaxed text-stone-900">
						{feedback.corrected}
					</p>
				</article>

				<article class="rounded-2xl border border-stone-200/80 bg-white p-4 shadow-sm sm:col-span-2">
					<h3 class="text-xs font-semibold uppercase tracking-wide text-stone-500">More natural German</h3>
					<p class="mt-2 whitespace-pre-wrap text-base leading-relaxed text-stone-900">{feedback.natural}</p>
				</article>

				<article class="rounded-2xl border border-stone-200/80 bg-white p-4 shadow-sm sm:col-span-2">
					<h3 class="text-xs font-semibold uppercase tracking-wide text-stone-500">English meaning</h3>
					<p class="mt-2 text-base leading-relaxed text-stone-800">{feedback.english}</p>
				</article>

				<article class="rounded-2xl border border-amber-100 bg-amber-50/80 p-4 shadow-sm sm:col-span-2">
					<h3 class="text-xs font-semibold uppercase tracking-wide text-amber-900/70">Tip</h3>
					<p class="mt-2 text-base leading-relaxed text-amber-950">{feedback.tip}</p>
				</article>
			</div>
		</section>
	{/if}

	{#if !result && !loading && !errorMessage}
		<p class="rounded-2xl border border-dashed border-stone-200 bg-stone-50/60 px-4 py-6 text-center text-sm text-stone-600">
			{#if practiceMode === 'speak' && speechSupported}
				Record your answer, fix the transcript if you like, then tap
				<span class="font-medium text-stone-800">Correct my German</span>.
			{:else}
				Write a few sentences in German, then tap
				<span class="font-medium text-stone-800">Correct my German</span>.
			{/if}
		</p>
	{/if}

	<section class="space-y-3" aria-label="Recent practice">
		<h2 class="text-sm font-semibold text-stone-900">Recent practice</h2>
		{#if history.length === 0}
			<p class="rounded-2xl border border-stone-200/80 bg-white px-4 py-5 text-sm text-stone-600 shadow-sm">
				No entries yet — your last ten corrections will show up here on this device.
			</p>
		{:else}
			<ul class="space-y-3">
				{#each history as h (h.timestamp)}
					<li class="rounded-2xl border border-stone-200/80 bg-white p-4 shadow-sm">
						<p class="text-xs text-stone-500">
							{new Date(h.timestamp).toLocaleString(undefined, {
								dateStyle: 'medium',
								timeStyle: 'short'
							})}
						</p>
						<p class="mt-1 text-sm font-medium text-stone-900 line-clamp-2">{h.prompt}</p>
						<p class="mt-2 text-sm text-stone-700 line-clamp-2"><span class="text-stone-500">You:</span> {h.original}</p>
						<p class="mt-1 text-sm text-stone-800 line-clamp-2">
							<span class="text-stone-500">Corrected:</span> {h.corrected}
						</p>
					</li>
				{/each}
			</ul>
		{/if}
	</section>
</main>
