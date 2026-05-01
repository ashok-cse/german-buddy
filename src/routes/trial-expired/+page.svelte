<script lang="ts">
	import { signOut } from '@auth/sveltekit/client';
</script>

<svelte:head>
	<title>Trial ended · German Buddy</title>
	<meta name="robots" content="noindex" />
</svelte:head>

<div class="min-h-dvh flex items-center justify-center px-6 py-12">
	<div class="w-full max-w-sm rounded-2xl border border-stone-200 bg-white p-8 shadow-sm text-center">
		<img src="/logo.svg" alt="German Buddy" class="mx-auto h-14 w-14" />
		<h1 class="mt-4 text-xl font-semibold tracking-tight text-stone-900">Your free trial has ended</h1>
		<p class="mt-2 text-sm text-stone-600">
			Thanks for trying German Buddy. Subscribe when you’re ready to keep practicing with full access.
		</p>
		<div class="mt-6 flex flex-col gap-3">
			<a
				href="/"
				class="flex w-full items-center justify-center rounded-full border border-stone-300 bg-white px-4 py-2.5 text-sm font-medium text-stone-800 shadow-sm transition-colors hover:bg-stone-50"
			>
				Back to home
			</a>
			<button
				type="button"
				onclick={() => signOut({ redirectTo: '/' })}
				class="text-sm text-stone-500 underline decoration-stone-300 underline-offset-2 hover:text-stone-800"
			>
				Sign out
			</button>
		</div>
	</div>
</div>
