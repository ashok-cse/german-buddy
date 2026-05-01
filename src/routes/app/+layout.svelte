<script lang="ts">
	import { page } from '$app/state';
	import { signOut } from '@auth/sveltekit/client';

	let { children } = $props();

	type Tab = { href: string; label: string; emoji: string };
	const tabs: Tab[] = [
		{ href: '/app/write', label: 'Write', emoji: '✍️' },
		{ href: '/app/speaking', label: 'Speaking', emoji: '🎙️' },
		{ href: '/app/conversation', label: 'Conversation', emoji: '💬' },
		{ href: '/app/feedback', label: 'Feedback', emoji: '📧' }
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
		<div class="mx-auto flex w-full max-w-3xl items-center justify-between gap-2 px-3 pt-3 sm:gap-3 sm:px-6">
			<a href="/app/write" class="flex min-w-0 items-center gap-2">
				<img src="/logo.svg" alt="" aria-hidden="true" class="h-7 w-7 shrink-0" />
				<span class="truncate text-sm font-semibold tracking-tight text-stone-900">German Buddy</span>
			</a>
			<button
				type="button"
				class="shrink-0 text-xs font-medium text-stone-500 transition-colors hover:text-stone-900 sm:text-sm"
				onclick={() => signOut({ redirectTo: '/' })}
			>
				Sign out
			</button>
		</div>
		<nav class="mx-auto w-full max-w-3xl px-3 py-3 sm:px-6" aria-label="Practice mode">
			<div
				class="-mx-3 overflow-x-auto overflow-y-hidden px-3 pb-0.5 sm:mx-0 sm:overflow-visible sm:px-0 sm:pb-0 [scrollbar-width:thin]"
				style="-webkit-overflow-scrolling: touch"
			>
				<div
					class="flex w-max min-w-full gap-1 rounded-xl border border-stone-200 bg-stone-100/90 p-1 shadow-inner sm:w-full sm:min-w-0"
					role="tablist"
				>
					{#each tabs as tab (tab.href)}
						{@const isActive = activeHref === tab.href}
						<a
							href={tab.href}
							role="tab"
							aria-selected={isActive}
							data-sveltekit-preload-data="hover"
							class="flex shrink-0 items-center justify-center gap-1 rounded-lg px-2.5 py-2 text-xs font-medium transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stone-400 sm:min-w-0 sm:flex-1 sm:gap-1.5 sm:px-3 sm:text-sm {isActive
								? 'bg-white text-stone-900 shadow-sm'
								: 'text-stone-600 hover:text-stone-900'}"
						>
							<span aria-hidden="true" class="shrink-0">{tab.emoji}</span>
							<span class="whitespace-nowrap">{tab.label}</span>
						</a>
					{/each}
				</div>
			</div>
		</nav>
	</header>

	<div class="mx-auto flex w-full min-h-0 max-w-3xl flex-1 flex-col">
		{@render children()}
	</div>
</div>
