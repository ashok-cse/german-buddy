<script lang="ts">
	const FEEDBACK_EMAIL = 'ashokmarmath8@gmail.com';

	let showedHint = $state(false);

	function openMailto() {
		const url = `mailto:${FEEDBACK_EMAIL}?subject=${encodeURIComponent('feedback')}`;
		window.location.href = url;
		showedHint = true;
	}
</script>

<svelte:head>
	<title>Feedback · German Buddy</title>
</svelte:head>

<div class="flex min-h-0 flex-1 flex-col gap-6 px-4 py-6 sm:px-6">
	<div>
		<h1 class="text-lg font-semibold text-stone-900">Feedback</h1>
		<p class="mt-1 text-sm text-stone-600">
			Tap the button to open your mail app and send feedback to us (subject: feedback).
		</p>
	</div>

	<button
		type="button"
		onclick={openMailto}
		class="inline-flex w-full items-center justify-center rounded-full border border-stone-300 bg-white px-5 py-2.5 text-sm font-medium text-stone-900 shadow-sm transition-colors hover:bg-stone-50 sm:w-auto"
	>
		Send feedback
	</button>

	{#if showedHint}
		<p class="text-xs text-stone-500" role="status">
			If your mail app didn’t open, email {FEEDBACK_EMAIL} with subject
			<code class="rounded bg-stone-200/80 px-1 py-0.5 text-[11px]">feedback</code>.
		</p>
	{/if}
</div>
