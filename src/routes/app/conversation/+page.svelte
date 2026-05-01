<script lang="ts">
	import { onDestroy, tick } from 'svelte';
	import { browser } from '$app/environment';
	import {
		startGermanDictation,
		getSpeechRecognitionCtor,
		ensureMicPermission,
		type DictationControl
	} from '$lib/speech-recognition';
	import { primeTts, prefetchGermanTts, speak, speakGerman, stopGermanTts } from '$lib/german-tts';
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

	type ChatPhase = 'idle' | 'connecting' | 'listening' | 'thinking' | 'speaking';

	let speechSupported = $state(false);
	let ttsSupported = $state(false);

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
	// Pauses between clauses are longer in learner German than in casual EN speech.
	const CHAT_SILENCE_MS = 3200;
	const CHAT_RESUME_DELAY_MS = 900;
	const CHAT_ECHO_WINDOW_MS = 1500;

	let chatLevel = $state<GermanLevel>('A2');
	let chatScenarioId = $state<string>(CONVERSATION_SCENARIOS[0].id);
	let chatStyle = $state<ConversationStyle>('roleplay');
	let chatLastTarget = $state<string | null>(null);
	let lastUserUtterance = '';

	let chatScrollEl = $state<HTMLDivElement | null>(null);

	const currentScenario = $derived(
		getScenarioById(chatScenarioId) ?? CONVERSATION_SCENARIOS[0]
	);

	const hasFeedback = $derived(
		!!chatLastCorrection ||
			chatLastCorrections.length > 0 ||
			!!chatLastExplanation ||
			!!chatLastPronunciation
	);

	const GERMAN_RATE_BY_LEVEL: Record<GermanLevel, number> = {
		A1: 0.75,
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
		speechSupported = !!getSpeechRecognitionCtor();
		ttsSupported = 'speechSynthesis' in window;
	});

	// Auto-scroll the chat thread to bottom when content changes.
	$effect(() => {
		// Track all things that grow the thread.
		void chatMessages.length;
		void chatLiveTranscript;
		void chatBuffer;
		void hasFeedback;
		if (!chatScrollEl) return;
		void tick().then(() => {
			chatScrollEl?.scrollTo({ top: chatScrollEl.scrollHeight, behavior: 'smooth' });
		});
	});

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
		stopGermanTts();
	}

	async function startChatSession(): Promise<void> {
		if (chatSessionActive) return;
		chatError = null;
		primeTts();
		const ok = await ensureMicPermission();
		if (!ok) {
			chatError =
				'Microphone access was blocked. Allow the mic for this site in your browser settings, then tap Start again.';
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
		chatLiveTranscript = '';
		chatPhase = 'listening';
		chatEchoGuardUntil = Date.now() + CHAT_ECHO_WINDOW_MS;
		if (chatBuffer.trim()) scheduleAutoSubmit();
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
				if (germanTarget) speakGerman(germanTarget, { rate: chatGermanRate, onEnd: onAllDone });
				else onAllDone();
			};
			if (englishOrGerman)
				speak(englishOrGerman, 'en-US', {
					rate: chatEnglishRate,
					preferMale: true,
					onEnd: playGerman
				});
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
			const germanTarget =
				typeof data?.germanTarget === 'string' && data.germanTarget.trim()
					? data.germanTarget.trim()
					: '';
			const assistantText = (data?.assistant ?? '').trim();

			const piperLine = chatStyle === 'tutor' ? germanTarget : assistantText;
			if (chatSessionActive && ttsSupported && piperLine.trim()) {
				prefetchGermanTts(piperLine.trim());
			}

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
				// Echo guard target: in tutor mode the user is *expected* to repeat
				// the German target back, so excluding it lets their first interim
				// land instead of being silently dropped as "looks like the bot's
				// own voice". In roleplay the assistant's own German is what we
				// want to suppress (speaker bleed), so include it.
				lastAssistantText =
					chatStyle === 'tutor'
						? assistantText.trim()
						: `${assistantText} ${germanTarget}`.trim();
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

	onDestroy(() => endChatSession());

	const phaseLabel = $derived(
		chatPhase === 'connecting'
			? 'Verbinde …'
			: chatPhase === 'listening'
				? 'Hört zu …'
				: chatPhase === 'thinking'
					? 'Denkt nach …'
					: chatPhase === 'speaking'
						? 'Spricht …'
						: 'Bereit'
	);

	const phaseTone = $derived(
		chatPhase === 'listening'
			? 'bg-red-500'
			: chatPhase === 'thinking'
				? 'bg-amber-500'
				: chatPhase === 'speaking'
					? 'bg-emerald-500'
					: chatPhase === 'connecting'
						? 'bg-stone-400'
						: 'bg-stone-300'
	);

	const phaseAnimated = $derived(
		chatPhase === 'listening' || chatPhase === 'speaking' || chatPhase === 'thinking'
	);
</script>

<svelte:head>
	<title>Conversation · German Buddy</title>
</svelte:head>

<main class="flex min-h-0 flex-1 flex-col">
	{#if !chatSessionActive}
		<!-- Setup screen: scrolls internally if too tall, button stays pinned at bottom -->
		<div
			class="flex-1 space-y-5 overflow-y-auto px-4 py-5 sm:px-6 sm:py-6 [overscroll-behavior:contain]"
		>
			<header class="space-y-1">
				<p class="text-xs font-medium uppercase tracking-wide text-stone-500">
					Conversation practice
				</p>
				<h1 class="text-2xl font-semibold tracking-tight text-stone-900 sm:text-3xl">
					Talk with your AI buddy.
				</h1>
				<p class="text-sm leading-relaxed text-stone-600">
					Pick a level + scenario, tap start, then just speak.
				</p>
			</header>

			{#if !speechSupported}
				<p
					class="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900"
				>
					Speech-to-text needs a supported browser (e.g. Chrome or Edge).
				</p>
			{/if}

			<section
				class="space-y-4 rounded-2xl border border-stone-200/80 bg-white p-4 shadow-sm sm:p-5"
				aria-label="Conversation settings"
			>
				<div class="space-y-1.5">
					<p class="text-xs font-medium uppercase tracking-wide text-stone-500">Mode</p>
					<div
						class="flex rounded-xl border border-stone-200 bg-stone-100/90 p-1 shadow-inner"
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
					<p class="text-xs leading-relaxed text-stone-500">
						{CONVERSATION_STYLE_HINTS[chatStyle]}
					</p>
				</div>

				<div class="space-y-1.5">
					<p class="text-xs font-medium uppercase tracking-wide text-stone-500">Level</p>
					<div
						class="flex rounded-xl border border-stone-200 bg-stone-100/90 p-1 shadow-inner"
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
					<div
						class="flex flex-wrap gap-1.5"
						role="group"
						aria-label="Conversation scenario"
					>
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
			</section>
		</div>

		<div
			class="shrink-0 border-t border-stone-200/80 bg-stone-100/95 px-4 py-3 backdrop-blur sm:px-6"
		>
			{#if chatError}
				<p class="mb-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-900">
					{chatError}
				</p>
			{/if}
			<button
				type="button"
				class="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-stone-900 px-4 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-stone-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stone-500 disabled:cursor-not-allowed disabled:opacity-60"
				onclick={() => void startChatSession()}
				disabled={chatLoading || !speechSupported}
				title={!speechSupported ? 'Use Chrome or Edge for speech recognition' : undefined}
			>
				<span class="h-2 w-2 rounded-full bg-emerald-400" aria-hidden="true"></span>
				Start conversation
			</button>
		</div>
	{:else}
		<!-- Active chat screen -->
		<div
			class="shrink-0 border-b border-stone-200/80 bg-white/90 px-4 py-2 backdrop-blur sm:px-6"
		>
			<div class="flex items-center justify-between gap-3">
				<p class="min-w-0 truncate text-xs text-stone-600">
					<span class="font-semibold text-stone-900">{chatLevel}</span>
					· {CONVERSATION_STYLE_LABELS[chatStyle]} · {currentScenario.label}
				</p>
				<span class="flex shrink-0 items-center gap-1.5 text-xs text-stone-500">
					<span
						class="h-2 w-2 rounded-full {phaseTone} {phaseAnimated ? 'animate-pulse' : ''}"
						aria-hidden="true"
					></span>
					<span>{phaseLabel}</span>
				</span>
			</div>
		</div>

		<div
			bind:this={chatScrollEl}
			class="flex-1 space-y-3 overflow-y-auto px-4 py-4 sm:px-6 [overscroll-behavior:contain]"
			aria-label="Chat thread"
		>
			{#if chatMessages.length === 0}
				<p class="text-sm text-stone-500">Verbinde …</p>
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
				{#if chatBuffer || chatLiveTranscript}
					<div class="flex justify-end">
						<div
							class="max-w-[85%] rounded-2xl border border-stone-300 border-dashed bg-white px-4 py-3 text-sm leading-relaxed text-stone-700 shadow-sm"
						>
							{(chatBuffer + (chatLiveTranscript ? ` ${chatLiveTranscript}` : '')).trim()}
						</div>
					</div>
				{/if}
			{/if}

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
						<p class="font-mono text-xs leading-relaxed text-stone-600">
							{chatLastPronunciation}
						</p>
					{/if}
				</div>
			{/if}

			{#if hasFeedback}
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

		<div
			class="shrink-0 border-t border-stone-200/80 bg-stone-100/95 px-4 py-3 backdrop-blur sm:px-6"
		>
			<div class="flex items-center justify-between gap-2">
				{#if chatPhase === 'listening'}
					<button
						type="button"
						class="inline-flex flex-1 items-center justify-center rounded-xl border border-stone-200 bg-white px-3 py-2.5 text-sm font-medium text-stone-900 shadow-sm transition hover:bg-stone-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stone-400 disabled:cursor-not-allowed disabled:opacity-50"
						onclick={() => void submitUserTurn()}
						disabled={!chatBuffer && !chatLiveTranscript.trim()}
					>
						Send now
					</button>
				{:else if chatPhase === 'speaking'}
					<button
						type="button"
						class="inline-flex flex-1 items-center justify-center rounded-xl border border-stone-200 bg-white px-3 py-2.5 text-sm font-medium text-stone-900 shadow-sm transition hover:bg-stone-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stone-400"
						onclick={() => {
							cancelTts();
							if (speechSupported) scheduleResumeListening();
							else chatPhase = 'idle';
						}}
					>
						Skip
					</button>
				{:else}
					<div
						class="flex flex-1 items-center gap-2 rounded-xl border border-stone-200 bg-white px-3 py-2.5 text-sm text-stone-700"
					>
						<span
							class="h-2 w-2 rounded-full {phaseTone} {phaseAnimated ? 'animate-pulse' : ''}"
							aria-hidden="true"
						></span>
						<span>{phaseLabel}</span>
					</div>
				{/if}
				<button
					type="button"
					class="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-2.5 text-sm font-medium text-red-900 shadow-sm transition hover:bg-red-100/90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-400"
					onclick={endChatSession}
				>
					<span class="h-2 w-2 rounded-full bg-red-600" aria-hidden="true"></span>
					End
				</button>
			</div>
		</div>
	{/if}
</main>
