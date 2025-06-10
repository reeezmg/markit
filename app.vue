<script setup lang="ts">
import { provideHooksContext } from './lib/hooks';
import { VueQueryDevtools } from '@tanstack/vue-query-devtools';
import PullToRefresh from 'pulltorefreshjs'

const config = useRuntimeConfig();
// Provide tanstack-query context
// Use an absolute endpoint so server-side fetch works too
const categoryStore = useCategoryStore()

onMounted(async () => {
  await categoryStore.fetchAllCategories()
  console.log('All Categories:', categoryStore.categories)
  PullToRefresh.init({
    mainElement: 'body',
    onRefresh() {
      // You can reload the whole page or trigger your data fetching logic
      window.location.reload()
    },
    instructionsPullToRefresh: '↓ Pull down to refresh',
    instructionsReleaseToRefresh: '↻ Release to refresh',
    instructionsRefreshing: '⏳ Refreshing...',
    distThreshold: 80,
    distMax: 120,
    distReload: 50,
    resistanceFunction(t) {
      return Math.min(1, t / 2.5)
    },
  })
})

provideHooksContext({
    endpoint: config.public.baseUrl,
});
const colorMode = useColorMode();

provideHeadlessUseId(() => useId());

const color = computed(() =>
    colorMode.value === 'dark' ? '#111827' : 'white',
);

useHead({
    meta: [
        { charset: 'utf-8' },
        {
            name: 'viewport',
            content: 'width=device-width, initial-scale=1, viewport-fit=cover',
        },
        {
            key: 'theme-color',
            name: 'theme-color',
            content: color,
        },
    ],
    link: [{ rel: 'icon', href: '/favicon.ico' }],
    htmlAttrs: {
        lang: 'en',
    },
});


const title = 'Bazaar - a new hospitality trade marketplace.';
const description = '';

useSeoMeta({
    title,
    description,
    ogTitle: title,
    ogDescription: description,
    ogImage: '',
    twitterImage: '',
    twitterCard: 'summary_large_image',
});
</script>



<template>
    <div>
        <NuxtLoadingIndicator />

        <NuxtLayout>
            <NuxtPage />
        </NuxtLayout>

        <UNotifications />
        <UModals />
    </div>
    <VueQueryDevtools />
</template>

<style>
body {
  overscroll-behavior-y: contain;
  -webkit-overflow-scrolling: touch;
  touch-action: pan-y;
}

  html, body {
    padding-top: env(safe-area-inset-top);
    padding-bottom: env(safe-area-inset-bottom);
    padding-left: env(safe-area-inset-left);
    padding-right: env(safe-area-inset-right);
    box-sizing: border-box;
  }

  /* Override text-sm only for mobile (default Tailwind breakpoint is 'sm: 640px') */
  @media (max-width: 639px) {
    .text-sm {
      font-size: 1rem !important;
      line-height: 1.5rem !important;
    }
  }
</style>

