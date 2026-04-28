<script lang="ts">
	import { onDestroy } from 'svelte';
	import { browser } from '$app/environment';
	import type { PracticeCategoryId } from '$lib/practice-catalog';
	import { getPracticeItems, randomItemIndex } from '$lib/practice-catalog';
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
	import { primeTts, speakGerman } from '$lib/german-tts';
	import CategoryTabs from '$lib/components/CategoryTabs.svelte';
	import PromptCard from '$lib/components/PromptCard.svelte';
	import PracticeFeedback from '$lib/components/PracticeFeedback.svelte';
	import RecentHistory from '$lib/components/RecentHistory.svelte';

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
	let ttsSupported = $state(false);
	let dictation: DictationControl | null = null;

	$effect(() => {
		if (!browser) return;
		history = loadHistory();
	});

	$effect(() => {
		if (!browser) return;
		speechSupported = !!getSpeechRecognitionCtor();
		ttsSupported = 'speechSynthesis' in window;
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

	async function startSpeaking(): Promise<void> {
		if (listening || !speechSupported) return;
		errorMessage = null;
		liveTranscript = '';
		primeTts();
		const ok = await ensureMicPermission();
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

	function setCategory(id: PracticeCategoryId): void {
		stopDictation();
		itemIndex = randomItemIndex(id);
		answer = '';
		result = null;
		errorMessage = null;
	}

	function newPrompt(): void {
		stopDictation();
		const nextIdx = randomItemIndex(categoryId, itemIndex);
		itemIndex = nextIdx;
		errorMessage = null;
		result = null;
		const items = getPracticeItems(categoryId);
		const nextText = items[nextIdx]?.prompt ?? items[0].prompt;
		if (ttsSupported) speakGerman(nextText);
	}

	async function correct(): Promise<void> {
		const trimmed = answer.trim();
		if (!trimmed) {
			errorMessage = 'Bitte nimm etwas auf oder schreib etwas auf Deutsch.';
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
</script>

<svelte:head>
	<title>Speaking · German Buddy</title>
</svelte:head>

<main
	class="flex flex-1 flex-col gap-6 overflow-y-auto px-4 py-6 pb-16 sm:px-6 sm:py-8 [overscroll-behavior:contain]"
>
	<header class="space-y-1">
		<p class="text-xs font-medium uppercase tracking-wide text-stone-500">Speaking practice</p>
		<h1 class="text-2xl font-semibold tracking-tight text-stone-900 sm:text-3xl">
			Speak it. Hear it. Fix it.
		</h1>
		<p class="text-sm leading-relaxed text-stone-600">
			Listen to the prompt, dictate your answer, then get gentle corrections.
		</p>
	</header>

	{#if !speechSupported}
		<p
			class="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900"
		>
			Speech-to-text needs a supported browser (e.g. Chrome or Edge). You can still type your
			answer below.
		</p>
	{/if}

	<CategoryTabs bind:value={categoryId} onChange={setCategory} />

	<PromptCard item={currentItem} {categoryId} {ttsSupported} onNew={newPrompt} />

	<section class="space-y-3" aria-label="Your answer">
		<div class="flex items-center justify-between">
			<label for="answer" class="text-sm font-semibold text-stone-900"
				>Your answer (spoken or edited)</label
			>
		</div>

		{#if speechSupported}
			<div
				class="flex flex-col items-center gap-3 rounded-2xl border border-stone-200/80 bg-white p-5 shadow-sm sm:p-6"
			>
				{#if !listening}
					<button
						type="button"
						class="group relative flex h-20 w-20 items-center justify-center rounded-full bg-stone-900 text-white shadow-lg transition hover:bg-stone-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-stone-500"
						aria-label="Start recording"
						onclick={startSpeaking}
					>
						<svg
							xmlns="http://www.w3.org/2000/svg"
							viewBox="0 0 24 24"
							fill="currentColor"
							class="h-9 w-9"
							aria-hidden="true"
						>
							<path
								d="M12 14a3 3 0 0 0 3-3V6a3 3 0 1 0-6 0v5a3 3 0 0 0 3 3Zm5-3a5 5 0 0 1-10 0H5a7 7 0 0 0 6 6.92V21h2v-3.08A7 7 0 0 0 19 11h-2Z"
							/>
						</svg>
					</button>
					<p class="text-sm font-medium text-stone-700">Tap to record</p>
				{:else}
					<button
						type="button"
						class="relative flex h-20 w-20 items-center justify-center rounded-full bg-red-600 text-white shadow-lg transition hover:bg-red-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-red-400"
						aria-label="Stop recording"
						onclick={stopDictation}
					>
						<span
							class="absolute inset-0 animate-ping rounded-full bg-red-500/40"
							aria-hidden="true"
						></span>
						<span class="relative h-6 w-6 rounded-sm bg-white" aria-hidden="true"></span>
					</button>
					<p class="text-sm font-medium text-red-700">Listening… tap to stop</p>
				{/if}

				{#if liveTranscript}
					<p
						class="w-full text-center text-sm italic leading-relaxed text-stone-500"
						aria-live="polite"
					>
						{liveTranscript}
					</p>
				{/if}
			</div>
		{/if}

		<textarea
			id="answer"
			bind:value={answer}
			rows="6"
			class="w-full resize-y rounded-2xl border border-stone-200 bg-white px-4 py-3 text-base leading-relaxed text-stone-900 shadow-inner outline-none ring-stone-300 transition placeholder:text-stone-400 focus:border-stone-300 focus:ring-2"
			placeholder="Dein gesprochener Text erscheint hier … Du kannst auch tippen."
			autocomplete="off"
			spellcheck="true"
			lang="de"
		></textarea>

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

	{#if errorMessage}
		<div
			class="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900"
			role="alert"
		>
			<p class="font-medium">That didn't work</p>
			<p class="mt-1 text-red-800/90">{errorMessage}</p>
		</div>
	{/if}

	{#if result}
		<PracticeFeedback {result} {ttsSupported} />
	{:else if !loading && !errorMessage}
		<p
			class="rounded-2xl border border-dashed border-stone-200 bg-stone-50/60 px-4 py-6 text-center text-sm text-stone-600"
		>
			{#if speechSupported}
				Record your answer, fix the transcript if you like, then tap
				<span class="font-medium text-stone-800">Correct my German</span>.
			{:else}
				Type your answer, then tap
				<span class="font-medium text-stone-800">Correct my German</span>.
			{/if}
		</p>
	{/if}

	<RecentHistory {history} />
</main>
