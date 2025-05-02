export default defineNuxtConfig({
  ssr: true,
  extends: ['@nuxt/ui-pro', './auth'],

  build: {
      transpile: ['trpc-nuxt'],
    },

  nitro: {
    plugins: ['~/nitro/ws'],
    esbuild: {
        options: {
          target: 'es2022'
        }
      },
    
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
        baseUrl: process.env.BASE_URL
    }
  },

  image: {},
  compatibilityDate: '2025-02-28',

  
});