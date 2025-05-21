<script setup lang="ts">
import { provideHooksContext } from './lib/hooks';
import { VueQueryDevtools } from '@tanstack/vue-query-devtools';


// Provide tanstack-query context
// Use an absolute endpoint so server-side fetch works too
provideHooksContext({
    endpoint: 'http://localhost:3000/api/model',
});
const colorMode = useColorMode();

provideHeadlessUseId(() => useId());

const color = computed(() =>
    colorMode.value === 'dark' ? '#111827' : 'white',
);

useHead({
    meta: [
        { charset: 'utf-8' },
        { name: 'viewport', content: 'width=device-width, initial-scale=1' },
        { key: 'theme-color', name: 'theme-color', content: color },
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
