<script lang="ts">
	import { page } from '$app/state';
	import { signIn } from '@auth/sveltekit/client';

	let email = $state('');
	let submitting = $state(false);
	let submitted = $state(false);
	let errorMessage = $state<string | null>(null);

	const session = $derived(page.data.session);

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

	function openApp() {
		window.location.href = '/app';
	}

	function continueWithGoogle() {
		void signIn('google', { redirectTo: '/app' });
	}
</script>

<svelte:head>
	<title>German Buddy — now in beta</title>
	<meta
		name="description"
		content="German Buddy is in open beta. Log in with Google to practice everyday German by writing, speaking, and chatting — free for early users at germanbuddy.ai."
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
				<span class="h-1.5 w-1.5 rounded-full bg-emerald-500"></span>
				Open beta · Log in and start practicing
			</span>

			<h1
				class="mt-6 text-4xl sm:text-5xl md:text-6xl font-semibold tracking-tight text-stone-900 leading-[1.05]"
			>
				Your friendly buddy<br />for everyday German.
			</h1>

			<p class="mt-6 text-lg text-stone-600 leading-relaxed">
				<strong class="font-medium text-stone-800">We’re in beta</strong> — log in with Google to use
				the full app. Write, speak, and chat with small real-life prompts and gentle corrections, free
				for early users while we improve things.
			</p>

			{#if session?.user}
				<div class="mt-10 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
					<p class="text-sm text-stone-600">
						Signed in as <span class="font-medium text-stone-900">{session.user.email ?? session.user.name}</span>
					</p>
					<button
						type="button"
						onclick={openApp}
						class="rounded-full bg-stone-900 px-6 py-3 text-sm font-medium text-stone-50 hover:bg-stone-800 transition-colors"
					>
						Go to practice
					</button>
				</div>
			{:else}
				<div class="mt-10 flex flex-col items-center gap-3">
					<button
						type="button"
						onclick={continueWithGoogle}
						class="inline-flex items-center justify-center gap-3 rounded-full border border-stone-300 bg-white px-6 py-3 text-sm font-medium text-stone-800 shadow-sm transition-colors hover:bg-stone-50"
					>
						<svg class="h-5 w-5 shrink-0" viewBox="0 0 24 24" aria-hidden="true">
							<path
								fill="#4285F4"
								d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
							/>
							<path
								fill="#34A853"
								d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
							/>
							<path
								fill="#FBBC05"
								d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
							/>
							<path
								fill="#EA4335"
								d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
							/>
						</svg>
						Log in with Google
					</button>
					<p class="text-xs text-stone-500">
						<a href="/login" class="font-medium text-stone-700 hover:underline">Sign in</a>
						if you were redirected here from the app.
					</p>
				</div>
			{/if}

			<div class="mt-14 border-t border-stone-200 pt-10">
				<p class="text-sm font-medium text-stone-700">Updates by email</p>
				<p class="mt-1 text-sm text-stone-500">
					Beta is open above — add your email if you only want occasional news.
				</p>

				<form
					onsubmit={joinWaitlist}
					class="mt-6 flex flex-col sm:flex-row gap-2 sm:gap-3 max-w-md mx-auto"
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
						class="rounded-full bg-stone-800 px-5 py-3 text-sm font-medium text-stone-50 hover:bg-stone-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
					>
						{#if submitted}
							You're on the list ✓
						{:else if submitting}
							Joining…
						{:else}
							Subscribe
						{/if}
					</button>
				</form>

				{#if errorMessage}
					<p class="mt-3 text-sm text-red-600">{errorMessage}</p>
				{:else if submitted}
					<p class="mt-3 text-sm text-stone-600">Danke! We’ll keep you posted.</p>
				{:else}
					<p class="mt-3 text-sm text-stone-500">Low volume. Unsubscribe anytime.</p>
				{/if}
			</div>
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
