<script lang="ts">
	import type { PracticeCategoryId, PracticeItem } from '$lib/practice-catalog';
	import { PRACTICE_CATEGORY_LABELS } from '$lib/practice-catalog';
	import { speakGerman } from '$lib/german-tts';

	let {
		item,
		categoryId,
		ttsSupported,
		onNew
	}: {
		item: PracticeItem;
		categoryId: PracticeCategoryId;
		ttsSupported: boolean;
		onNew: () => void;
	} = $props();
</script>

<section
	class="rounded-2xl border border-stone-200/80 bg-white p-5 shadow-sm sm:p-6"
	aria-label="Prompt"
>
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
			<p class="text-lg leading-relaxed text-stone-800">{item.prompt}</p>
			{#if item.learnText}
				<div
					class="rounded-xl border border-emerald-100 bg-emerald-50/70 px-3 py-3 text-sm text-emerald-950"
				>
					<p class="text-xs font-semibold uppercase tracking-wide text-emerald-900/70">
						Example / pronunciation
					</p>
					<p class="mt-1.5 leading-relaxed text-emerald-950">{item.learnText}</p>
					{#if ttsSupported}
						<button
							type="button"
							class="mt-2 inline-flex items-center gap-2 rounded-lg border border-emerald-200/80 bg-white px-3 py-1.5 text-xs font-medium text-emerald-900 shadow-sm transition hover:bg-emerald-50/90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-400"
							onclick={() => speakGerman(item.learnText ?? '')}
						>
							<span class="text-emerald-700" aria-hidden="true">▶</span>
							Listen to example
						</button>
					{/if}
				</div>
			{/if}
			{#if ttsSupported}
				<button
					type="button"
					class="inline-flex items-center gap-2 rounded-xl border border-stone-200 bg-stone-50 px-3 py-2 text-sm font-medium text-stone-800 shadow-sm transition hover:bg-stone-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stone-400"
					onclick={() => speakGerman(item.prompt)}
				>
					<span class="text-stone-600" aria-hidden="true">▶</span>
					Listen to task
				</button>
			{/if}
		</div>
		<button
			type="button"
			class="inline-flex shrink-0 items-center justify-center self-start rounded-xl border border-stone-200 bg-stone-50 px-4 py-2.5 text-sm font-medium text-stone-800 shadow-sm transition hover:bg-stone-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stone-400"
			onclick={onNew}
		>
			New prompt
		</button>
	</div>
</section>
