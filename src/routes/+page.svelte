<script lang="ts">
	let email = $state('');
	let submitting = $state(false);
	let submitted = $state(false);
	let errorMessage = $state<string | null>(null);

	async function joinWaitlist(event: SubmitEvent) {
		event.preventDefault();
		if (submitting || submitted) return;
		errorMessage = null;
		submitting = true;
		try {
			const response = await fetch('/api/waitlist', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ email: email.trim() })
			});
			if (!response.ok) {
				const data = await response.json().catch(() => null);
				throw new Error(data?.message || 'Could not sign you up. Please try again.');
			}
			submitted = true;
		} catch (err) {
			errorMessage = err instanceof Error ? err.message : 'Something went wrong.';
		} finally {
			submitting = false;
		}
	}
</script>

<svelte:head>
	<title>German Buddy — your friendly companion for everyday German</title>
	<meta
		name="description"
		content="German Buddy helps you practice everyday German by writing, speaking, and chatting with an AI buddy. Join the waitlist at germanbuddy.ai."
	/>
</svelte:head>

<div class="min-h-dvh flex flex-col">
	<main class="flex-1 px-6 sm:px-10">
		<section class="max-w-2xl mx-auto pt-16 sm:pt-24 pb-16 text-center">
			<img
				src="/logo.svg"
				alt="German Buddy"
				class="mx-auto h-24 sm:h-28 w-auto"
			/>

			<span
				class="mt-8 inline-flex items-center gap-2 rounded-full bg-stone-200/70 px-3 py-1 text-xs font-medium text-stone-600"
			>
				<span class="h-1.5 w-1.5 rounded-full bg-amber-500"></span>
				Coming soon · germanbuddy.ai
			</span>

			<h1
				class="mt-6 text-4xl sm:text-5xl md:text-6xl font-semibold tracking-tight text-stone-900 leading-[1.05]"
			>
				Your friendly buddy<br />for everyday German.
			</h1>

			<p class="mt-6 text-lg text-stone-600 leading-relaxed">
				Write, speak, and chat your way to fluency. German Buddy gives you small,
				real-life prompts and gentle corrections — so daily practice actually sticks.
			</p>

			<form
				onsubmit={joinWaitlist}
				class="mt-10 flex flex-col sm:flex-row gap-2 sm:gap-3 max-w-md mx-auto"
				novalidate
			>
				<label class="sr-only" for="email">Email address</label>
				<input
					id="email"
					type="email"
					required
					autocomplete="email"
					placeholder="you@example.com"
					bind:value={email}
					disabled={submitting || submitted}
					class="flex-1 rounded-full border border-stone-300 bg-white px-5 py-3 text-stone-900 placeholder:text-stone-400 focus:outline-none focus:border-stone-900 focus:ring-2 focus:ring-stone-900/10 disabled:opacity-60"
				/>
				<button
					type="submit"
					disabled={submitting || submitted || !email}
					class="rounded-full bg-stone-900 px-5 py-3 text-sm font-medium text-stone-50 hover:bg-stone-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
				>
					{#if submitted}
						You're on the list ✓
					{:else if submitting}
						Joining…
					{:else}
						Join the waitlist
					{/if}
				</button>
			</form>

			{#if errorMessage}
				<p class="mt-3 text-sm text-red-600">{errorMessage}</p>
			{:else if submitted}
				<p class="mt-3 text-sm text-stone-600">
					Danke! We'll send you a note the moment German Buddy is ready.
				</p>
			{:else}
				<p class="mt-3 text-sm text-stone-500">
					No spam. Just a single email when we launch.
				</p>
			{/if}
		</section>

		<section class="max-w-3xl mx-auto pb-20 grid grid-cols-1 sm:grid-cols-3 gap-3">
			{#each [
				{ title: 'Write', body: 'Answer real-life prompts and get clear, kind corrections.' },
				{ title: 'Speak', body: 'Dictate your answer and hear native pronunciation back.' },
				{ title: 'Chat', body: 'Roleplay everyday scenes with a patient AI buddy.' }
			] as feature}
				<div class="rounded-2xl border border-stone-200 bg-white/60 p-5">
					<div class="text-sm font-medium text-stone-900">{feature.title}</div>
					<div class="mt-1 text-sm text-stone-600 leading-relaxed">{feature.body}</div>
				</div>
			{/each}
		</section>
	</main>

	<footer class="px-6 sm:px-10 py-6 text-xs text-stone-500 flex items-center justify-between">
		<div class="flex items-center gap-2">
			<img src="/logo.svg" alt="" aria-hidden="true" class="h-5 w-5" />
			<span>© {new Date().getFullYear()}</span>
		</div>
		<span>germanbuddy.ai</span>
	</footer>
</div>
