<script lang="ts">
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
	let ttsSupported = $state(false);

	$effect(() => {
		if (!browser) return;
		history = loadHistory();
	});

	$effect(() => {
		ttsSupported = typeof window !== 'undefined' && 'speechSynthesis' in window;
	});

	const currentItem = $derived.by(() => {
		const items = getPracticeItems(categoryId);
		return items[itemIndex] ?? items[0];
	});
	const currentPrompt = $derived(currentItem.prompt);

	function setCategory(id: PracticeCategoryId): void {
		itemIndex = randomItemIndex(id);
		answer = '';
		result = null;
		errorMessage = null;
	}

	function newPrompt(): void {
		itemIndex = randomItemIndex(categoryId, itemIndex);
		errorMessage = null;
		result = null;
	}

	async function correct(): Promise<void> {
		const trimmed = answer.trim();
		if (!trimmed) {
			errorMessage = 'Bitte schreib zuerst etwas auf Deutsch.';
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

	function onKeydown(e: KeyboardEvent): void {
		if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
			e.preventDefault();
			void correct();
		}
	}
</script>

<svelte:head>
	<title>Write · German Buddy</title>
</svelte:head>

<main
	class="flex flex-1 flex-col gap-6 overflow-y-auto px-4 py-6 pb-16 sm:px-6 sm:py-8 [overscroll-behavior:contain]"
>
	<header class="space-y-1">
		<p class="text-xs font-medium uppercase tracking-wide text-stone-500">Writing practice</p>
		<h1 class="text-2xl font-semibold tracking-tight text-stone-900 sm:text-3xl">
			Write a few sentences in German.
		</h1>
		<p class="text-sm leading-relaxed text-stone-600">
			Pick a topic, answer the prompt, then get clear, kind corrections.
		</p>
	</header>

	<CategoryTabs bind:value={categoryId} onChange={setCategory} />

	<PromptCard item={currentItem} {categoryId} {ttsSupported} onNew={newPrompt} />

	<section class="space-y-3" aria-label="Your answer">
		<label for="answer" class="text-sm font-semibold text-stone-900">Your German answer</label>
		<textarea
			id="answer"
			bind:value={answer}
			onkeydown={onKeydown}
			rows="7"
			class="w-full resize-y rounded-2xl border border-stone-200 bg-white px-4 py-3 text-base leading-relaxed text-stone-900 shadow-inner outline-none ring-stone-300 transition placeholder:text-stone-400 focus:border-stone-300 focus:ring-2"
			placeholder="Schreib hier auf Deutsch …"
			autocomplete="off"
			spellcheck="true"
			lang="de"
		></textarea>
		<p class="text-xs text-stone-500">
			Tipp: <kbd class="rounded bg-stone-100 px-1 py-0.5">⌘</kbd> oder
			<kbd class="rounded bg-stone-100 px-1 py-0.5">Strg</kbd> +
			<kbd class="rounded bg-stone-100 px-1 py-0.5">Enter</kbd> schickt ab.
		</p>
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
			Write a few sentences in German, then tap
			<span class="font-medium text-stone-800">Correct my German</span>.
		</p>
	{/if}

	<RecentHistory {history} />
</main>
