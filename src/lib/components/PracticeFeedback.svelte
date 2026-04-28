<script lang="ts">
	import type { CorrectionResult } from '$lib/correction';
	import { speakGerman } from '$lib/german-tts';

	let {
		result,
		ttsSupported
	}: {
		result: CorrectionResult;
		ttsSupported: boolean;
	} = $props();

	async function copy(text: string): Promise<void> {
		try {
			await navigator.clipboard.writeText(text);
		} catch {
			/* ignore */
		}
	}
</script>

<section class="space-y-3" aria-label="Feedback">
	<h2 class="text-sm font-semibold text-stone-900">Feedback</h2>

	<article class="rounded-2xl border border-stone-200/80 bg-white p-4 shadow-sm">
		<h3 class="text-xs font-semibold uppercase tracking-wide text-stone-500">Your answer</h3>
		<p class="mt-2 whitespace-pre-wrap text-base leading-relaxed text-stone-900">
			{result.original}
		</p>
	</article>

	<article class="rounded-2xl border border-stone-200/80 bg-white p-4 shadow-sm">
		<div class="flex flex-wrap items-center justify-between gap-2">
			<h3 class="text-xs font-semibold uppercase tracking-wide text-stone-500">
				Corrected German
			</h3>
			<div class="flex flex-wrap gap-2">
				{#if ttsSupported}
					<button
						type="button"
						class="rounded-lg border border-stone-200 bg-stone-50 px-2.5 py-1 text-xs font-medium text-stone-800 hover:bg-stone-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stone-400"
						onclick={() => speakGerman(result.corrected)}
					>
						Read aloud
					</button>
				{/if}
				<button
					type="button"
					class="rounded-lg border border-stone-200 bg-stone-50 px-2.5 py-1 text-xs font-medium text-stone-800 hover:bg-stone-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stone-400"
					onclick={() => void copy(result.corrected)}
				>
					Copy
				</button>
			</div>
		</div>
		<p class="mt-2 whitespace-pre-wrap text-base font-medium leading-relaxed text-stone-900">
			{result.corrected}
		</p>
	</article>

	<article class="rounded-2xl border border-stone-200/80 bg-white p-4 shadow-sm">
		<h3 class="text-xs font-semibold uppercase tracking-wide text-stone-500">
			More natural German
		</h3>
		<p class="mt-2 whitespace-pre-wrap text-base leading-relaxed text-stone-900">
			{result.natural}
		</p>
	</article>

	<article class="rounded-2xl border border-stone-200/80 bg-white p-4 shadow-sm">
		<h3 class="text-xs font-semibold uppercase tracking-wide text-stone-500">English meaning</h3>
		<p class="mt-2 text-base leading-relaxed text-stone-800">{result.english}</p>
	</article>

	<article class="rounded-2xl border border-amber-100 bg-amber-50/80 p-4 shadow-sm">
		<h3 class="text-xs font-semibold uppercase tracking-wide text-amber-900/70">Tip</h3>
		<p class="mt-2 text-base leading-relaxed text-amber-950">{result.tip}</p>
	</article>
</section>
