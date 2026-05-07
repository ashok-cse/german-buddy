<script lang="ts">
	import { goto } from '$app/navigation';
	import { browser } from '$app/environment';
	import { onDestroy } from 'svelte';
	import type { VocabCard } from '$lib/vocab-deck';
	import { shuffleInPlace } from '$lib/vocab-deck';
	import { prefetchGermanTts, primeTts, speakGerman, stopGermanTts } from '$lib/german-tts';

	let { data } = $props();

	const SWIPE_THRESHOLD = 96;
	const FLY_X = 520;
	const ROT_PER_PX = 0.065;
	const MAX_ROT = 14;

	let shuffled = $state<VocabCard[]>([]);
	let index = $state(0);
	let revealed = $state(false);
	let dragging = $state(false);
	let swipeX = $state(0);
	let swipeY = $state(0);
	let exitTo = $state<null | 'next' | 'prev'>(null);
	let startClientX = 0;
	let startClientY = 0;
	let originX = 0;
	let originY = 0;

	const current = $derived.by(() => shuffled[index] ?? null);
	const nextBehind = $derived.by(() => shuffled[index + 1] ?? null);
	const atEnd = $derived(shuffled.length > 0 && index >= shuffled.length - 1);
	const progressLabel = $derived(
		shuffled.length ? `${index + 1} / ${shuffled.length}` : '0 / 0'
	);

	const rotateDeg = $derived.by(() => {
		const r = swipeX * ROT_PER_PX;
		return Math.max(-MAX_ROT, Math.min(MAX_ROT, r));
	});

	const transitionStyle = $derived.by(() => {
		if (dragging) return 'none';
		if (exitTo) return 'transform 0.32s cubic-bezier(0.4, 0, 0.2, 1)';
		return 'transform 0.22s cubic-bezier(0.34, 1.3, 0.64, 1)';
	});

	$effect(() => {
		data.day;
		data.cards;
		shuffled = shuffleInPlace([...data.cards]);
		index = 0;
		revealed = false;
		swipeX = 0;
		swipeY = 0;
		exitTo = null;
		dragging = false;
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
		swipeX = 0;
		swipeY = 0;
		exitTo = null;
	}

	function resetSwipe(): void {
		swipeX = 0;
		swipeY = 0;
		exitTo = null;
		dragging = false;
	}

	function prevCard(): void {
		if (index <= 0) return;
		index -= 1;
		revealed = false;
		resetSwipe();
	}

	function nextCard(): void {
		if (index >= shuffled.length - 1) return;
		index += 1;
		revealed = false;
		resetSwipe();
	}

	function playGerman(): void {
		if (!current?.german) return;
		primeTts();
		speakGerman(String(current.german));
	}

	function toggleReveal(): void {
		revealed = !revealed;
	}

	function onDeckPointerDown(e: PointerEvent): void {
		const t = e.target as HTMLElement;
		if (t.closest('button, a, select, input, textarea')) return;
		if (exitTo) return;
		dragging = true;
		startClientX = e.clientX;
		startClientY = e.clientY;
		originX = swipeX;
		originY = swipeY;
		(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
	}

	function onDeckPointerMove(e: PointerEvent): void {
		if (!dragging || exitTo) return;
		swipeX = originX + (e.clientX - startClientX);
		swipeY = originY + (e.clientY - startClientY) * 0.35;
	}

	function onDeckPointerUp(e: PointerEvent): void {
		if (!dragging) return;
		dragging = false;
		try {
			(e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
		} catch {
			/* ignore */
		}

		const sx = swipeX;
		if (sx <= -SWIPE_THRESHOLD) {
			if (index >= shuffled.length - 1) {
				resetSwipe();
				return;
			}
			exitTo = 'next';
			swipeX = -FLY_X;
			swipeY = swipeY * 0.6;
			return;
		}
		if (sx >= SWIPE_THRESHOLD) {
			if (index <= 0) {
				resetSwipe();
				return;
			}
			exitTo = 'prev';
			swipeX = FLY_X;
			swipeY = swipeY * 0.6;
			return;
		}
		swipeX = 0;
		swipeY = 0;
	}

	function onDeckPointerCancel(): void {
		dragging = false;
		if (!exitTo) {
			swipeX = 0;
			swipeY = 0;
		}
	}

	function onTopCardTransitionEnd(e: TransitionEvent): void {
		if (e.propertyName !== 'transform') return;
		if (exitTo === 'next') {
			nextCard();
			return;
		}
		if (exitTo === 'prev') {
			prevCard();
			return;
		}
	}

	function passWithButton(): void {
		if (index >= shuffled.length - 1) return;
		dragging = false;
		exitTo = 'next';
		swipeX = -FLY_X;
		swipeY = 8;
	}

	function backWithButton(): void {
		if (index <= 0) return;
		dragging = false;
		exitTo = 'prev';
		swipeX = FLY_X;
		swipeY = 8;
	}

	function onKeydown(e: KeyboardEvent): void {
		const el = e.target as HTMLElement | null;
		if (el?.closest?.('select, input, textarea, [contenteditable="true"]')) return;
		if (e.key === 'ArrowRight') {
			e.preventDefault();
			passWithButton();
		} else if (e.key === 'ArrowLeft') {
			e.preventDefault();
			backWithButton();
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
	<div class="shrink-0 space-y-0.5">
		<h1 class="text-lg font-bold tracking-tight text-stone-900 sm:text-xl">
			WortWelle
			<span class="text-stone-300">·</span>
			<span class="font-semibold text-amber-800/90">Vocab Swipe</span>
		</h1>
		<p class="text-xs font-medium italic text-stone-600 sm:text-sm">Swipe your German vocab</p>
		<p class="text-xs text-stone-500 sm:text-sm">
			Drag the card like a dating app — left for next, right for previous. Listen, then reveal English when
			you’re ready.
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
		<div class="flex min-h-0 flex-1 flex-col items-stretch justify-center pb-2">
			<div
				class="relative mx-auto w-full max-w-md px-1"
				style="min-height: min(58dvh, 28rem); perspective: 1200px;"
			>
				{#if nextBehind}
					<div
						class="absolute inset-x-0 top-3 bottom-0 z-0 mx-auto w-[calc(100%-1.25rem)] max-w-[calc(100%-1.25rem)] rounded-2xl border border-stone-200/90 bg-stone-50/95 p-6 shadow-sm transition-transform duration-300 ease-out pointer-events-none select-none"
						style="transform: scale(0.94) translateY(0.75rem);"
						aria-hidden="true"
					>
						<p class="text-center text-sm font-medium text-stone-400 line-clamp-3">
							{nextBehind.german}
						</p>
					</div>
				{/if}

				<!-- svelte-ignore a11y_no_static_element_interactions -->
				<div
					class="absolute inset-x-0 top-0 z-10 mx-auto w-full max-w-md cursor-grab touch-none select-none active:cursor-grabbing"
					style="touch-action: none;"
					onpointerdown={onDeckPointerDown}
					onpointermove={onDeckPointerMove}
					onpointerup={onDeckPointerUp}
					onpointercancel={onDeckPointerCancel}
				>
					<div
						class="rounded-2xl border border-stone-200 bg-white p-6 shadow-lg will-change-transform"
						style="transform: translate3d({swipeX}px, {swipeY}px, 0) rotate({rotateDeg}deg); transition: {transitionStyle};"
						ontransitionend={onTopCardTransitionEnd}
					>
						{#if swipeX < -28}
							<div
								class="pointer-events-none absolute left-4 top-1/2 z-20 -translate-y-1/2 rounded-md border-2 border-emerald-400/80 bg-emerald-50/95 px-2 py-1 text-xs font-bold uppercase tracking-wide text-emerald-800 shadow-sm"
								style="opacity: {Math.min(1, Math.abs(swipeX) / SWIPE_THRESHOLD)}"
							>
								Next →
							</div>
						{/if}
						{#if swipeX > 28}
							<div
								class="pointer-events-none absolute right-4 top-1/2 z-20 -translate-y-1/2 rounded-md border-2 border-amber-400/80 bg-amber-50/95 px-2 py-1 text-xs font-bold uppercase tracking-wide text-amber-900 shadow-sm"
								style="opacity: {Math.min(1, Math.abs(swipeX) / SWIPE_THRESHOLD)}"
							>
								← Back
							</div>
						{/if}

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
							Drag card · ← next · → back · Space to flip
						</p>
					</div>
				</div>
			</div>

			<div class="mx-auto mt-2 flex w-full max-w-md gap-3">
				<button
					type="button"
					class="flex-1 rounded-xl border border-stone-200 bg-white py-3 text-sm font-medium text-stone-800 shadow-sm transition hover:bg-stone-50 disabled:opacity-40"
					disabled={index <= 0 || !!exitTo}
					onclick={backWithButton}
				>
					Back
				</button>
				<button
					type="button"
					class="flex-1 rounded-xl border border-stone-200 bg-white py-3 text-sm font-medium text-stone-800 shadow-sm transition hover:bg-stone-50 disabled:opacity-40"
					disabled={atEnd || !!exitTo}
					onclick={passWithButton}
				>
					Next
				</button>
			</div>
		</div>
	{/if}
</div>
