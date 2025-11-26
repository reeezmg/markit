<script setup lang="ts">
import { provideHooksContext } from './lib/hooks';
import { VueQueryDevtools } from '@tanstack/vue-query-devtools';
import { Capacitor } from '@capacitor/core'
import { BleClient } from '@capacitor-community/bluetooth-le'
import { SplashScreen } from '@capacitor/splash-screen';

const config = useRuntimeConfig();
const useAuth = () => useNuxtApp().$auth;
// Provide tanstack-query context
// Use an absolute endpoint so server-side fetch works too
const categoryStore = useCategoryStore()
const userStore = useUserStore()
useCheckoutEvents()
useBillEvents()

const PRINTER_SERVICES = {
  SERVICE: '000018f0-0000-1000-8000-00805f9b34fb',
  CHARACTERISTIC: '00002af1-0000-1000-8000-00805f9b34fb'
}

let connectedDevices: string[] = []

const loadSavedPrinters = () => {
  const saved = localStorage.getItem('savedPrinters')
  return saved ? JSON.parse(saved) : []
}


onMounted(async () => {
  if (!Capacitor.isNativePlatform()) {
    console.log('BLE not supported in browser ❌')
    return
  }

  SplashScreen.hide()

  try {
    await BleClient.initialize()
    console.log('📡 BLE initialized')

    const printers = loadSavedPrinters()
    if (printers.length) {
      console.log(`📦 Found ${printers.length} saved printers, trying to connect...`)
    }

    for (const printer of printers) {
      try {
        await BleClient.connect(printer.deviceId)
        connectedDevices.push(printer.deviceId)
        console.log(`✅ Connected to ${printer.name || printer.deviceId}`)
      } catch (err: any) {
        console.warn(`⚠️ Could not connect to ${printer.deviceId}: ${err.message}`)
      }
    }
  } catch (err) {
    console.error('BLE init failed:', err)
  }

})





onBeforeUnmount(async () => {
  console.log('🔌 Disconnecting from all printers...')
  for (const deviceId of connectedDevices) {
    try {
      await BleClient.disconnect(deviceId)
      console.log(`📴 Disconnected from ${deviceId}`)
    } catch (err: any) {
      console.warn(`⚠️ Error disconnecting from ${deviceId}: ${err.message}`)
    }
  }
  connectedDevices = []
})

onMounted(async () => {
  await categoryStore.fetchCategories()
  await userStore.fetchUsers(useAuth().session.value?.companyId!)
})



onMounted(() => {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js');
  }
});

provideHooksContext({
  endpoint: config.public.baseUrl
});

// provideHooksContext({
//   endpoint: config.public.baseUrl,
//   fetch: async (input, init: RequestInit = {}) => {
//     const result = await $fetch(input, {
//       ...init,
//       credentials: 'include',
//     });

//     // Wrap into a Response-like object
//     return new Response(JSON.stringify(result), {
//       headers: { 'Content-Type': 'application/json' },
//     });
//   },
//   logging: true,
// });


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

