export default defineNuxtConfig({
  extends: ['@nuxt/ui-pro', './auth'],

  ssr: false, // ⚠️ Set false for Electron static rendering

  app: {
    baseURL: './', // ✅ Required for Electron to load local files correctly
    head: {
      link: [
        { rel: 'manifest', href: '/manifest.json' },
        { rel: 'apple-touch-icon', href: '/icons/icon-192.png' }
      ],
      meta: [
        { name: 'theme-color', content: '#3367D6' }
      ]
    }
  },

  build: {
    transpile: [
      'trpc-nuxt',
      '@electric-sql/pglite',
    ]
  },

  nitro: {
    // ❌ Remove 'vercel' preset – not compatible with local/Electron
    esbuild: {
      options: {
        target: 'es2022'
      }
    },
    preset: 'static', // ✅ Use static generation for Electron
  },

  vite: {
    optimizeDeps: {
      exclude: ['@electric-sql/pglite'],
    },
    ssr: {
      noExternal: ['@electric-sql/pglite'],
    }
  },

  modules: [
    '@nuxt/ui',
    '@nuxt/fonts',
    '@vueuse/nuxt',
    '@nuxt/image',
    'nuxt-icon',
    'nuxt-headlessui',
    '@nuxtjs/tailwindcss',
    [
      'pinia-plugin-persistedstate/nuxt',
      {
        autoImports: ['piniaPluginPersistedstate']
      }
    ],
    [
      '@pinia/nuxt',
      {
        autoImports: ['defineStore', 'acceptHMRUpdate'],
      },
    ],
  ],

  piniaPluginPersistedstate: {
    key: 'markit_%id',
  },

  plugins: [
    // Add any client-side only plugin here if needed
  ],

  imports: {
    dirs: ['stores'],
  },

  ui: {
    safelistColors: ['primary', 'red', 'orange', 'green'],
  },

  devtools: {
    enabled: true,
  },

  runtimeConfig: {
    sessionSecret: process.env.SESSION_SECRET,
    sourceId: process.env.SOURCE_ID,
    secret: process.env.SECRET,

    public: {
      r2Id: process.env.R2_ID,
      r2Secret: process.env.R2_SECRET,
      r2Bucket: process.env.R2_BUCKET,
      r2AccountId: process.env.R2_ACCOUNT_ID,
      baseUrl: process.env.BASE_URL,
      electricApiUrl: process.env.ELECTRIC_API_URL
    }
  },

  image: {},

  compatibilityDate: '2025-02-28'
})
