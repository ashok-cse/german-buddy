<script lang="ts">
	import {
		GERMAN_LEVELS,
		GERMAN_LEVEL_HINTS,
		type GermanLevel
	} from '$lib/conversation';

	let {
		value = $bindable(),
		onChange
	}: {
		value: GermanLevel;
		onChange?: (level: GermanLevel) => void;
	} = $props();

	function pick(lvl: GermanLevel): void {
		if (lvl === value) return;
		value = lvl;
		onChange?.(lvl);
	}
</script>

<div class="space-y-2">
	<p class="text-xs font-medium uppercase tracking-wide text-stone-500">Level</p>
	<div
		class="flex rounded-xl border border-stone-200 bg-stone-100/90 p-1 shadow-inner"
		role="group"
		aria-label="German level"
	>
		{#each GERMAN_LEVELS as lvl (lvl)}
			<button
				type="button"
				class="flex-1 rounded-lg px-3 py-1.5 text-sm font-medium transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stone-400 {value ===
				lvl
					? 'bg-white text-stone-900 shadow-sm'
					: 'text-stone-600 hover:text-stone-900'}"
				onclick={() => pick(lvl)}
			>
				{lvl}
			</button>
		{/each}
	</div>
	<p class="text-xs leading-relaxed text-stone-500">{GERMAN_LEVEL_HINTS[value]}</p>
</div>
