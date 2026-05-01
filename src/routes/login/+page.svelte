<script lang="ts">
	import type { PageProps } from './$types';
	import { signIn } from '@auth/sveltekit/client';

	let { data }: PageProps = $props();

	function continueWithGoogle() {
		const params = new URLSearchParams(window.location.search);
		const next = params.get('next');
		const redirectTo =
			next && /^\/(?!login\b|logout\b)[A-Za-z0-9/_\-?=&.]*$/.test(next) ? next : '/app';
		void signIn('google', { redirectTo });
	}
</script>

<svelte:head>
	<title>Sign in · German Buddy</title>
	<meta name="robots" content="noindex" />
</svelte:head>

<div class="min-h-dvh flex items-center justify-center px-6 py-12">
	<div class="w-full max-w-sm rounded-2xl border border-stone-200 bg-white p-8 shadow-sm">
		<div class="flex flex-col items-center text-center">
			<img src="/logo.svg" alt="German Buddy" class="h-14 w-14" />
			<h1 class="mt-4 text-xl font-semibold tracking-tight text-stone-900">Sign in</h1>
			<p class="mt-1 text-sm text-stone-500">Continue with your Google account.</p>
		</div>

		{#if !data.configured}
			<p class="mt-6 text-sm text-amber-700" role="alert">
				Google sign-in is not configured. Set <code class="text-xs">AUTH_SECRET</code>,
				<code class="text-xs">PUBLIC_GOOGLE_CLIENT_ID</code>, and
				<code class="text-xs">GOOGLE_CLIENT_SECRET</code> in <code class="text-xs">.env</code>.
			</p>
		{/if}

		<button
			type="button"
			disabled={!data.configured}
			onclick={continueWithGoogle}
			class="mt-6 flex w-full items-center justify-center gap-3 rounded-full border border-stone-300 bg-white px-4 py-2.5 text-sm font-medium text-stone-800 shadow-sm transition-colors hover:bg-stone-50 disabled:cursor-not-allowed disabled:opacity-50"
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
			Continue with Google
		</button>

		<p class="mt-4 text-center text-xs text-stone-500">
			<a href="/" class="hover:text-stone-700">← Back to germanbuddy.ai</a>
		</p>
	</div>
</div>
