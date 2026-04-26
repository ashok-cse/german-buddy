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
		type DictationControl
	} from '$lib/speech-recognition';
	import { speakGerman } from '$lib/german-tts';

	type PracticeMode = 'write' | 'speak';

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

	function startSpeaking(): void {
		if (listening || !speechSupported) return;
		errorMessage = null;
		liveTranscript = '';
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
		<p class="text-xs font-medium uppercase tracking-wide text-stone-500">Day-one practice</p>
		<h1 class="text-3xl font-semibold tracking-tight text-stone-900 sm:text-4xl">German Mirror</h1>
		<p class="max-w-2xl text-base leading-relaxed text-stone-600">
			Pick a topic, then answer in German — by typing or by speaking — and get corrections. Numbers and alphabet
			include an optional example line you can hear for pronunciation.
		</p>
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
		</div>
		{#if practiceMode === 'speak' && !speechSupported}
			<p class="text-sm text-amber-800/90">
				Speech-to-text needs a supported browser (e.g. Chrome or Edge). You can still use Writing mode.
			</p>
		{/if}
	</header>

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
			<p class="text-xs text-stone-500">Tipp: <kbd class="rounded bg-stone-100 px-1 py-0.5">⌘</kbd> oder
				<kbd class="rounded bg-stone-100 px-1 py-0.5">Strg</kbd> + <kbd class="rounded bg-stone-100 px-1 py-0.5">Enter</kbd>
				schickt ab.</p>
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
