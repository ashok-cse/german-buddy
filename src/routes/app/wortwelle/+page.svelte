<script lang="ts">
	import { goto } from '$app/navigation';
	import { browser } from '$app/environment';
	import { onDestroy } from 'svelte';
	import type { VocabCard } from '$lib/vocab-deck';
	import { shuffleInPlace } from '$lib/vocab-deck';
	import { prefetchGermanTts, primeTts, speakGerman, stopGermanTts } from '$lib/german-tts';

	let { data } = $props();

	let shuffled = $state<VocabCard[]>([]);
	let index = $state(0);
	let revealed = $state(false);
	let dragStartX = $state<number | null>(null);

	const current = $derived.by(() => shuffled[index] ?? null);
	const atEnd = $derived(shuffled.length > 0 && index >= shuffled.length - 1);
	const progressLabel = $derived(
		shuffled.length ? `${index + 1} / ${shuffled.length}` : '0 / 0'
	);

	$effect(() => {
		data.day;
		data.cards;
		shuffled = shuffleInPlace([...data.cards]);
		index = 0;
		revealed = false;
	});

	$effect(() => {
		if (!browser || !current) return;
		const nextCard = shuffled[index + 1];
		if (nextCard?.german) prefetchGermanTts(String(nextCard.german));
	});

	function goDay(delta: number): void {
		const next = data.totalDays ? Math.min(data.totalDays, Math.max(1, data.day + delta)) : 1;
		void goto(`/app/wortwelle?day=${next}`, { replaceState: true, noScroll: true });
	}

	function setDay(e: Event): void {
		const v = Number((e.target as HTMLSelectElement).value);
		if (!Number.isFinite(v)) return;
		void goto(`/app/wortwelle?day=${v}`, { replaceState: true, noScroll: true });
	}

	function reshuffle(): void {
		shuffled = shuffleInPlace([...data.cards]);
		index = 0;
		revealed = false;
	}

	function prevCard(): void {
		if (index <= 0) return;
		index -= 1;
		revealed = false;
	}

	function nextCard(): void {
		if (index >= shuffled.length - 1) return;
		index += 1;
		revealed = false;
	}

	function playGerman(): void {
		if (!current?.german) return;
		primeTts();
		speakGerman(String(current.german));
	}

	function toggleReveal(): void {
		revealed = !revealed;
	}

	function onPointerDown(e: PointerEvent): void {
		const t = e.target as HTMLElement;
		if (t.closest('button, a, select, input, textarea')) return;
		dragStartX = e.clientX;
		(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
	}

	function onPointerUp(e: PointerEvent): void {
		if (dragStartX === null) return;
		const dx = e.clientX - dragStartX;
		dragStartX = null;
		try {
			(e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
		} catch {
			/* ignore */
		}
		if (Math.abs(dx) < 56) return;
		if (dx < 0) nextCard();
		else prevCard();
	}

	function onKeydown(e: KeyboardEvent): void {
		const el = e.target as HTMLElement | null;
		if (el?.closest?.('select, input, textarea, [contenteditable="true"]')) return;
		if (e.key === 'ArrowRight') {
			e.preventDefault();
			nextCard();
		} else if (e.key === 'ArrowLeft') {
			e.preventDefault();
			prevCard();
		} else if (e.key === ' ' || e.key === 'Enter') {
			e.preventDefault();
			toggleReveal();
		}
	}

	onDestroy(() => {
		stopGermanTts();
	});
</script>

<svelte:window onkeydown={onKeydown} />

<div class="flex min-h-0 flex-1 flex-col gap-4 px-3 py-4 sm:px-6">
	<div class="shrink-0 space-y-1">
		<h1 class="text-lg font-bold tracking-tight text-stone-900 sm:text-xl">WortWelle</h1>
		<p class="text-xs text-stone-500 sm:text-sm">
			Swipe through your daily German deck — hear native-style audio, reveal English when you’re ready.
		</p>
	</div>

	<div class="flex shrink-0 flex-wrap items-center gap-2 rounded-xl border border-stone-200 bg-white/90 p-3 shadow-sm">
		<button
			type="button"
			class="rounded-lg border border-stone-200 bg-stone-50 px-3 py-2 text-sm font-medium text-stone-800 transition hover:bg-stone-100 disabled:opacity-40"
			disabled={data.day <= 1}
			onclick={() => goDay(-1)}
		>
			← Day
		</button>
		<label class="flex items-center gap-2 text-sm text-stone-600">
			<span class="sr-only">Plan day</span>
			<select
				class="rounded-lg border border-stone-200 bg-white px-2 py-2 text-sm font-medium text-stone-900"
				value={data.day}
				onchange={setDay}
			>
				{#each Array.from({ length: data.totalDays }, (_, i) => i + 1) as d (d)}
					<option value={d}>Day {d}</option>
				{/each}
			</select>
		</label>
		<button
			type="button"
			class="rounded-lg border border-stone-200 bg-stone-50 px-3 py-2 text-sm font-medium text-stone-800 transition hover:bg-stone-100 disabled:opacity-40"
			disabled={data.day >= data.totalDays}
			onclick={() => goDay(1)}
		>
			Day →
		</button>
		<button
			type="button"
			class="ml-auto rounded-lg border border-amber-200/80 bg-amber-50 px-3 py-2 text-sm font-medium text-amber-950 transition hover:bg-amber-100/90"
			onclick={reshuffle}
		>
			Shuffle
		</button>
	</div>

	{#if !current}
		<p class="text-sm text-stone-500">No cards for this day.</p>
	{:else}
		<div class="flex min-h-0 flex-1 flex-col items-stretch justify-center">
			<!-- svelte-ignore a11y_no_static_element_interactions -->
			<div
				class="relative mx-auto w-full max-w-md touch-pan-y select-none rounded-2xl border border-stone-200 bg-white p-6 shadow-md outline-none"
				onpointerdown={onPointerDown}
				onpointerup={onPointerUp}
				onpointercancel={() => {
					dragStartX = null;
				}}
			>
				<div class="mb-3 flex items-start justify-between gap-3">
					<div class="min-w-0">
						<p class="text-[10px] font-semibold uppercase tracking-wider text-stone-400">
							{current.phase} · {current.theme}
						</p>
						<p class="mt-1 font-mono text-xs text-stone-500">{progressLabel}</p>
					</div>
					<button
						type="button"
						class="flex shrink-0 items-center gap-1.5 rounded-full border border-stone-200 bg-stone-50 px-3 py-2 text-xs font-medium text-stone-700 transition hover:bg-stone-100"
						onclick={(e) => {
							e.stopPropagation();
							playGerman();
						}}
						aria-label="Play German pronunciation"
					>
						<svg class="h-4 w-4" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
							<path
								d="M3 10v4c0 .55.45 1 1 1h3l3.29 3.29c.63.63 1.71.18 1.71-.71V6.41c0-.89-1.08-1.34-1.71-.71L7 9H4c-.55 0-1 .45-1 1zm13.5 2A4.5 4.5 0 0 0 14 7.97v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 4.45v2.16c2.89.86 5 3.54 5 6.59s-2.11 5.73-5 6.59v2.16c4.01-.91 7-4.49 7-8.75s-2.99-7.84-7-8.75z"
							/>
						</svg>
						Listen
					</button>
				</div>

				<p class="text-2xl font-semibold leading-snug text-stone-900 sm:text-3xl">
					{current.german}
				</p>
				{#if current.ipa}
					<p class="mt-2 font-mono text-sm text-stone-600">/{current.ipa}/</p>
				{/if}

				<button
					type="button"
					class="mt-6 w-full rounded-xl border border-dashed border-stone-300 bg-stone-50/80 py-3 text-sm font-medium text-stone-700 transition hover:border-stone-400 hover:bg-stone-100"
					onclick={(e) => {
						e.stopPropagation();
						toggleReveal();
					}}
				>
					{revealed ? 'Hide English' : 'Show English'}
				</button>

				{#if revealed}
					<div class="mt-4 space-y-3 border-t border-stone-100 pt-4">
						<p class="text-base font-medium text-stone-800">{current.english}</p>
						{#if current.useCase}
							<p class="text-sm leading-relaxed text-stone-600">{current.useCase}</p>
						{/if}
					</div>
				{/if}

				<p class="mt-6 text-center text-[11px] text-stone-400">
					Swipe ← → · Space to flip · Day matches your 90-day sheet
				</p>
			</div>

			<div class="mx-auto mt-4 flex w-full max-w-md gap-3">
				<button
					type="button"
					class="flex-1 rounded-xl border border-stone-200 bg-white py-3 text-sm font-medium text-stone-800 shadow-sm transition hover:bg-stone-50 disabled:opacity-40"
					disabled={index <= 0}
					onclick={prevCard}
				>
					Previous
				</button>
				<button
					type="button"
					class="flex-1 rounded-xl border border-stone-200 bg-white py-3 text-sm font-medium text-stone-800 shadow-sm transition hover:bg-stone-50 disabled:opacity-40"
					disabled={atEnd}
					onclick={nextCard}
				>
					Next
				</button>
			</div>
		</div>
	{/if}
</div>
