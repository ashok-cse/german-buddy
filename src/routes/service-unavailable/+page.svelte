<script lang="ts">
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
</script>

<svelte:head>
	<title>Unavailable · German Buddy</title>
	<meta name="robots" content="noindex" />
</svelte:head>

<div class="min-h-dvh flex items-center justify-center px-6 py-12">
	<div class="w-full max-w-md rounded-2xl border border-stone-200 bg-white p-8 shadow-sm text-center">
		<img src="/logo.svg" alt="German Buddy" class="mx-auto h-14 w-14" />
		<h1 class="mt-4 text-xl font-semibold tracking-tight text-stone-900">{data.title}</h1>
		<p class="mt-2 text-sm text-stone-600">{data.detail}</p>
		<a
			href="/"
			class="mt-6 inline-flex w-full items-center justify-center rounded-full border border-stone-300 bg-white px-4 py-2.5 text-sm font-medium text-stone-800 shadow-sm transition-colors hover:bg-stone-50"
		>
			Back to home
		</a>
	</div>
</div>
