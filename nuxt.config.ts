export default defineNuxtConfig({
  extends: ['@nuxt/ui-pro', './auth'],

  ssr: true,

  app: {
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
      '@electric-sql/pglite', // ✅ ElectricSQL support
    ]
  },

nitro: {
  preset: 'vercel',
    routeRules: {
    '/nonetwork': { prerender: true },
  },
  esbuild: { options: { target: 'es2022' } },
},

  vite: {
    optimizeDeps: {
      exclude: ['@electric-sql/pglite','@point-of-sale/receipt-printer-encoder'],
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
    '@nuxtjs/sitemap',
    'nuxt-icon',
    'nuxt-headlessui',
    '@nuxtjs/tailwindcss',
    '@nuxtjs/robots',
    [
    'pinia-plugin-persistedstate/nuxt',
    {
      autoImports:['piniaPluginPersistedstate']
    }
    ],
    [
      '@pinia/nuxt',
      {
        autoImports: ['defineStore', 'acceptHMRUpdate'],
      },
    ],
  ],
  plugins: [
    // ✅ You can register Electric plugin here if needed:
    // '~/plugins/electric.client.ts'
  ],

  site: { 
  url: 'https://markit.co.in' ,
  name: 'Markit' 
 },



  imports: {
    dirs: ['stores'],
  },

  ui: {
    safelistColors: ['primary', 'red', 'orange', 'green','tertiary'],
  },

  devtools: {
    enabled: true,
  },

   runtimeConfig: {
    sessionSecret: process.env.SESSION_SECRET, // ✅ Move inside runtimeConfig
    sourceId: process.env.SOURCE_ID,
    secret: process.env.SECRET,
    // private runtime config is irrelevant in client-only mode
    public: {
      r2Id: process.env.R2_ID,
      r2Secret: process.env.R2_SECRET,
      r2Bucket: process.env.R2_BUCKET,
      r2AccountId: process.env.R2_ACCOUNT_ID,
      baseUrl: process.env.BASE_URL,
      serverUrl: process.env.SERVER_URL,
      electricApiUrl: process.env.ELECTRIC_API_URL
    }
  },


  image: {},

  compatibilityDate: '2025-02-28'
})

