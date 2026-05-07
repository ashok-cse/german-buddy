<script lang="ts">
	import { page } from '$app/state';
	import { signOut } from '@auth/sveltekit/client';

	let { children } = $props();

	type Tab = { href: string; label: string; nav: string; emoji: string };
	/** `nav` = short label for bottom bar (3–6 chars); `label` = full name for top bar + tooltips */
	const tabs: Tab[] = [
		{ href: '/app/write', label: 'Write', nav: 'Write', emoji: '✍️' },
		{ href: '/app/speaking', label: 'Speaking', nav: 'Speak', emoji: '🎙️' },
		{ href: '/app/conversation', label: 'Conversation', nav: 'Chat', emoji: '💬' },
		{ href: '/app/wortwelle', label: 'Vocab Swipe', nav: 'Swipe', emoji: '💫' },
		{ href: '/app/feedback', label: 'Feedback', nav: 'Mail', emoji: '📧' }
	];

	const activeHref = $derived.by(() => {
		const path = page.url.pathname;
		return tabs.find((t) => path === t.href || path.startsWith(`${t.href}/`))?.href ?? tabs[0].href;
	});
</script>

<div class="flex h-dvh flex-col overflow-hidden bg-stone-100 text-stone-900">
	<header
		class="shrink-0 border-b border-stone-200/80 bg-stone-100/90 backdrop-blur-md supports-backdrop-filter:bg-stone-100/75"
	>
		<div class="mx-auto flex w-full max-w-3xl items-center justify-between gap-2 px-3 py-2.5 sm:gap-3 sm:px-6 sm:py-3">
			<a href="/app/write" class="flex min-w-0 items-center gap-2 active:opacity-80">
				<img src="/logo.svg" alt="" aria-hidden="true" class="h-7 w-7 shrink-0" />
				<span class="truncate text-sm font-semibold tracking-tight text-stone-900">German Buddy</span>
			</a>
			<button
				type="button"
				class="shrink-0 rounded-lg px-2 py-1.5 text-xs font-medium text-stone-500 transition-colors hover:bg-stone-200/50 hover:text-stone-900 sm:text-sm"
				onclick={() => signOut({ redirectTo: '/' })}
			>
				Sign out
			</button>
		</div>

		<!-- Desktop / tablet: primary nav under header (horizontal, no scroll) -->
		<nav
			class="mx-auto hidden w-full max-w-3xl px-3 pb-3 md:block sm:px-6"
			aria-label="Practice modes"
		>
			<div
				class="grid grid-cols-5 gap-1 rounded-xl bg-stone-200/55 p-1 shadow-inner"
				role="tablist"
			>
				{#each tabs as tab (tab.href)}
					{@const isActive = activeHref === tab.href}
					<a
						href={tab.href}
						role="tab"
						aria-selected={isActive}
						aria-current={isActive ? 'page' : undefined}
						data-sveltekit-preload-data="hover"
						title={tab.label}
						class="flex min-h-11 items-center justify-center gap-1.5 rounded-lg px-2 text-center text-xs font-medium transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-500/70 sm:text-sm {isActive
							? 'bg-white text-stone-900 shadow-sm ring-1 ring-stone-200/90'
							: 'text-stone-600 hover:bg-stone-200/45 hover:text-stone-900'}"
					>
						<span aria-hidden="true" class="shrink-0 text-base leading-none sm:text-lg">{tab.emoji}</span>
						<span class="hidden min-w-0 truncate lg:inline">{tab.label}</span>
						<span class="min-w-0 truncate lg:hidden">{tab.nav}</span>
					</a>
				{/each}
			</div>
		</nav>
	</header>

	<!-- Main: bottom padding on small screens for fixed tab bar + home indicator -->
	<div
		class="mx-auto flex w-full min-h-0 max-w-3xl flex-1 flex-col pb-[calc(4.25rem+env(safe-area-inset-bottom,0px))] md:pb-0"
	>
		{@render children()}
	</div>

	<!-- Mobile: bottom tab bar (thumb zone, iOS/Android convention for 3–5 primary destinations) -->
	<nav
		class="fixed inset-x-0 bottom-0 z-50 border-t border-stone-200/90 bg-stone-100/95 shadow-[0_-4px_24px_-4px_rgba(0,0,0,0.07)] backdrop-blur-md supports-backdrop-filter:bg-stone-100/85 md:hidden"
		aria-label="Practice modes"
		style="padding-bottom: env(safe-area-inset-bottom, 0px)"
	>
		<div class="mx-auto grid h-full max-w-3xl grid-cols-5 px-0.5 pt-1">
			{#each tabs as tab (tab.href)}
				{@const isActive = activeHref === tab.href}
				<a
					href={tab.href}
					aria-label={tab.label}
					aria-current={isActive ? 'page' : undefined}
					data-sveltekit-preload-data="tap"
					class="tap-target flex flex-col items-center justify-center gap-0.5 rounded-lg py-1.5 text-[10px] font-semibold leading-tight transition active:scale-[0.97] {isActive
						? 'text-amber-900'
						: 'text-stone-500 hover:text-stone-800'}"
				>
					<span
						class="relative flex h-9 w-9 items-center justify-center rounded-xl text-lg leading-none transition {isActive
							? 'bg-amber-100/90 ring-1 ring-amber-200/80'
							: ''}"
						aria-hidden="true"
					>
						{tab.emoji}
					</span>
					<span class="max-w-[4.25rem] truncate text-center" aria-hidden="true">{tab.nav}</span>
				</a>
			{/each}
		</div>
	</nav>
</div>

<style>
	/* Minimum touch target ~44px (Apple HIG); links are tall enough via padding + icon box */
	.tap-target {
		min-height: 3.25rem;
	}
</style>
