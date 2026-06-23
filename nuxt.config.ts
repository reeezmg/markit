export default defineNuxtConfig({
  extends: ['@nuxt/ui-pro', './auth'],

  ssr: true,

  app: {
    head: {
      link: [
        { rel: 'manifest', href: '/manifest.json' },
        { rel: 'apple-touch-icon', href: '/icons/icon-192.png' }
      ],
      meta: [{ name: 'theme-color', content: '#3367D6' }]
    }
  },

  build: {
    transpile: [
      'trpc-nuxt',
    ]
  },

  nitro: {
    preset: 'vercel',
    routeRules: {
      '/nonetwork': { prerender: true },
    },
    esbuild: { options: { target: 'es2022' } }
  },

  vite: {
    optimizeDeps: {
      exclude: ['@point-of-sale/receipt-printer-encoder'],
    },

    // ⭐ Eager load EVERYTHING → One bundle
    build: {
      rollupOptions: {
        output: {
          manualChunks: () => 'app.js'
        }
      }
    }
  },

  modules: [
    '@nuxt/ui',
    '@nuxt/fonts',
    '@vueuse/nuxt',
    '@nuxt/image',
    '@nuxtjs/sitemap',
    'nuxt-headlessui',
    '@nuxtjs/tailwindcss',
    '@nuxtjs/robots',
    [
      '@pinia/nuxt',
      { autoImports: ['defineStore', 'acceptHMRUpdate'] }
    ],
    [
      'pinia-plugin-persistedstate/nuxt',
      { autoImports:['piniaPluginPersistedstate'] }
    ],
  ],

  plugins: [],

  site: { 
    url: 'https://markit.co.in',
    name: 'Markit'
  },

  imports: { dirs: ['stores'] },

  ui: {
    safelistColors: ['primary', 'red', 'orange', 'green', 'tertiary'],
  },

  devtools: { enabled: true },

  runtimeConfig: {
    sessionSecret: process.env.SESSION_SECRET,
    sourceId: process.env.SOURCE_ID,
    secret: process.env.SECRET,
    // custom-api (FastAPI) — server-only; seller shipping ops proxy through here.
    customApiUrl: process.env.CUSTOM_API_URL || 'http://localhost:8000',
    customApiServiceToken: process.env.CUSTOM_API_SERVICE_TOKEN || '',

    public: {
      r2Id: process.env.R2_ID,
      r2Secret: process.env.R2_SECRET,
      r2Bucket: process.env.R2_BUCKET,
      r2AccountId: process.env.R2_ACCOUNT_ID,
      baseUrl: process.env.BASE_URL,
      serverUrl: process.env.SERVER_URL,
      storefrontUrl: process.env.STOREFRONT_URL || 'http://localhost:5173',
      // Edit-session container (Cloud Run) — the storefront chat sends prompts here.
      storefrontEditorUrl: process.env.STOREFRONT_EDITOR_URL || 'https://storefront-sandbox-68712209533.us-central1.run.app',
    }
  },

  image: {},

  icon: {
    serverBundle: 'remote'
  },

  compatibilityDate: '2025-02-28'
})
