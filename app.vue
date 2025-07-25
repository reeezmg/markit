<script setup lang="ts">
import { provideHooksContext } from './lib/hooks';
import { VueQueryDevtools } from '@tanstack/vue-query-devtools';
const config = useRuntimeConfig();
const useAuth = () => useNuxtApp().$auth;
// Provide tanstack-query context
// Use an absolute endpoint so server-side fetch works too
const categoryStore = useCategoryStore()
const userStore = useUserStore()

onMounted(async () => {
  await categoryStore.fetchCategories()
  await userStore.fetchUsers(useAuth().session.value?.companyId!)
  console.log('All Categories:', userStore.users)
})

onMounted(() => {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js');
  }
});


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


const title = 'Markit';
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

