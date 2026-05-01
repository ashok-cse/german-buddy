<script lang="ts">
	import { page } from '$app/state';
	import { signOut } from '@auth/sveltekit/client';

	let { children } = $props();

	type Tab = { href: string; label: string; emoji: string };
	const tabs: Tab[] = [
		{ href: '/app/write', label: 'Write', emoji: '✍️' },
		{ href: '/app/speaking', label: 'Speaking', emoji: '🎙️' },
		{ href: '/app/conversation', label: 'Conversation', emoji: '💬' }
	];

	const activeHref = $derived.by(() => {
		const path = page.url.pathname;
		return tabs.find((t) => path === t.href || path.startsWith(`${t.href}/`))?.href ?? tabs[0].href;
	});
</script>

<div class="flex h-dvh flex-col overflow-hidden bg-stone-100 text-stone-900">
	<header
		class="shrink-0 border-b border-stone-200/80 bg-stone-100/85 backdrop-blur supports-[backdrop-filter]:bg-stone-100/70"
	>
		<div class="mx-auto flex w-full max-w-3xl items-center justify-between gap-3 px-4 pt-3 sm:px-6">
			<a href="/app/write" class="flex items-center gap-2">
				<img src="/logo.svg" alt="" aria-hidden="true" class="h-7 w-7" />
				<span class="text-sm font-semibold tracking-tight text-stone-900">German Buddy</span>
			</a>
			<button
				type="button"
				class="text-xs font-medium text-stone-500 transition-colors hover:text-stone-900"
				onclick={() => signOut({ redirectTo: '/' })}
			>
				Sign out
			</button>
		</div>
		<nav class="mx-auto w-full max-w-3xl px-4 py-3 sm:px-6" aria-label="Practice mode">
			<div
				class="flex gap-1 rounded-xl border border-stone-200 bg-stone-100/90 p-1 shadow-inner"
				role="tablist"
			>
				{#each tabs as tab (tab.href)}
					{@const isActive = activeHref === tab.href}
					<a
						href={tab.href}
						role="tab"
						aria-selected={isActive}
						data-sveltekit-preload-data="hover"
						class="flex flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stone-400 {isActive
							? 'bg-white text-stone-900 shadow-sm'
							: 'text-stone-600 hover:text-stone-900'}"
					>
						<span aria-hidden="true">{tab.emoji}</span>
						<span>{tab.label}</span>
					</a>
				{/each}
			</div>
		</nav>
	</header>

	<div class="mx-auto flex w-full min-h-0 max-w-3xl flex-1 flex-col">
		{@render children()}
	</div>
</div>
