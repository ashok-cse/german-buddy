<script lang="ts">
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();
</script>

<svelte:head>
	<title>Sign in · German Buddy</title>
	<meta name="robots" content="noindex" />
</svelte:head>

<div class="min-h-dvh flex items-center justify-center px-6 py-12">
	<form
		method="POST"
		class="w-full max-w-sm rounded-2xl border border-stone-200 bg-white p-8 shadow-sm"
	>
		<div class="flex flex-col items-center text-center">
			<img src="/logo.svg" alt="German Buddy" class="h-14 w-14" />
			<h1 class="mt-4 text-xl font-semibold tracking-tight text-stone-900">Sign in</h1>
			<p class="mt-1 text-sm text-stone-500">Enter your credentials to open the app.</p>
		</div>

		<div class="mt-6 space-y-4">
			<div>
				<label class="block text-sm font-medium text-stone-700" for="username">Username</label>
				<input
					id="username"
					name="username"
					type="text"
					autocomplete="username"
					required
					autofocus
					value={form?.username ?? ''}
					class="mt-1 w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-stone-900 placeholder:text-stone-400 focus:outline-none focus:border-stone-900 focus:ring-2 focus:ring-stone-900/10"
				/>
			</div>

			<div>
				<label class="block text-sm font-medium text-stone-700" for="password">Password</label>
				<input
					id="password"
					name="password"
					type="password"
					autocomplete="current-password"
					required
					class="mt-1 w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-stone-900 placeholder:text-stone-400 focus:outline-none focus:border-stone-900 focus:ring-2 focus:ring-stone-900/10"
				/>
			</div>
		</div>

		{#if form?.error}
			<p class="mt-4 text-sm text-red-600" role="alert">{form.error}</p>
		{:else if !data.configured}
			<p class="mt-4 text-sm text-amber-600" role="alert">
				Server credentials are not configured yet. Set <code>APP_USERNAME</code> and
				<code>APP_PASSWORD</code> in <code>.env</code>.
			</p>
		{/if}

		<button
			type="submit"
			class="mt-6 w-full rounded-full bg-stone-900 px-4 py-2.5 text-sm font-medium text-stone-50 hover:bg-stone-800 transition-colors disabled:opacity-50"
		>
			Sign in
		</button>

		<p class="mt-4 text-center text-xs text-stone-500">
			<a href="/" class="hover:text-stone-700">← Back to germanbuddy.ai</a>
		</p>
	</form>
</div>
