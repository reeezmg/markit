export default defineNuxtConfig({

  extends: [process.env.NUXT_UI_PRO_PATH || '@nuxt/ui-pro', './auth'],

  build: {
      transpile: ['trpc-nuxt']
    },

  nitro: {
    plugins: ['~/nitro/ws'],
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
          '@pinia/nuxt',
          {
              autoImports: ['defineStore', 'acceptHMRUpdate'],
          },
      ],
  ],

  imports: {
      dirs: ['stores'],
  },


  ui: {
      icons: ['heroicons', 'simple-icons'],
      safelistColors: ['primary', 'red', 'orange', 'green'],
  },

  devtools: {
      enabled: true,
  },
  runtimeConfig: {
   

    // public variables go under public:
    public: {
        awsId: process.env.AWS_ID,
        awsSecret: process.env.AWS_SECRET,
        awsBucket: process.env.AWS_BUCKET,
    }
  },

  image: {},
  compatibilityDate: '2025-02-28',

  
});