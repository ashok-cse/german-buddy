<script lang="ts">
	import { onMount } from 'svelte';
	import { signOut } from '@auth/sveltekit/client';

	onMount(() => {
		void signOut({ redirectTo: '/' });
	});
</script>

<p class="px-6 py-10 text-center text-sm text-stone-600">Signing you out…</p>
