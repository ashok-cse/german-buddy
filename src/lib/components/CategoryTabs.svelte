<script lang="ts">
	import type { PracticeCategoryId } from '$lib/practice-catalog';
	import {
		PRACTICE_CATEGORY_HINTS,
		PRACTICE_CATEGORY_LABELS,
		PRACTICE_CATEGORY_ORDER
	} from '$lib/practice-catalog';

	let {
		value = $bindable(),
		onChange
	}: {
		value: PracticeCategoryId;
		onChange?: (id: PracticeCategoryId) => void;
	} = $props();

	function pick(id: PracticeCategoryId): void {
		if (id === value) return;
		value = id;
		onChange?.(id);
	}
</script>

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
				class="min-w-0 flex-1 rounded-lg px-2.5 py-2 text-xs font-medium transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stone-400 sm:flex-none sm:px-3 sm:text-sm {value ===
				cid
					? 'bg-white text-stone-900 shadow-sm'
					: 'text-stone-600 hover:text-stone-900'}"
				onclick={() => pick(cid)}
			>
				{PRACTICE_CATEGORY_LABELS[cid]}
			</button>
		{/each}
	</div>
	<p class="text-xs leading-relaxed text-stone-500">{PRACTICE_CATEGORY_HINTS[value]}</p>
</div>
