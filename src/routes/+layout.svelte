<script lang="ts">
	import './layout.css';

	let { children } = $props();
</script>

<svelte:head>
	<link rel="icon" type="image/svg+xml" href="/logo.svg" />
	<title>German Buddy</title>
</svelte:head>

<div class="min-h-dvh bg-stone-100 text-stone-900 antialiased">
	{@render children()}
</div>
