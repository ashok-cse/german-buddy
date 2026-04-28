<script lang="ts">
	import type { HistoryEntry } from '$lib/history';

	let { history }: { history: HistoryEntry[] } = $props();
</script>

<section class="space-y-3" aria-label="Recent practice">
	<h2 class="text-sm font-semibold text-stone-900">Recent practice</h2>
	{#if history.length === 0}
		<p
			class="rounded-2xl border border-stone-200/80 bg-white px-4 py-5 text-sm text-stone-600 shadow-sm"
		>
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
					<p class="mt-2 text-sm text-stone-700 line-clamp-2">
						<span class="text-stone-500">You:</span>
						{h.original}
					</p>
					<p class="mt-1 text-sm text-stone-800 line-clamp-2">
						<span class="text-stone-500">Corrected:</span>
						{h.corrected}
					</p>
				</li>
			{/each}
		</ul>
	{/if}
</section>
