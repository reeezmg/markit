export default defineNuxtConfig({
  extends: ['@nuxt/ui-pro', './auth'],
  sessionSecret: process.env.SESSION_SECRET,
  
  // Change SSR based on environment
  ssr: process.env.NODE_ENV === 'production' ? true : false,

  build: {
    transpile: ['trpc-nuxt'],
    // Add Electron-specific build target
    extend(config, { isClient }) {
      if (isClient && process.env.ELECTRON === 'true') {
        config.target = 'electron-renderer'
      }
    }
  },

  // Ensure standalone output for Electron
  output: {
    standalone: true,
    // For Electron, we want to use node-server preset in production
    ...(process.env.ELECTRON === 'true' ? {
      server: 'node-server'
    } : {})
  },

  nitro: {
    // Change preset for Electron
    preset: process.env.ELECTRON === 'true' ? 'node-server' : 'vercel',
    esbuild: {
      options: {
        target: 'es2022'
      }
    },
    // Electron-specific server options
    ...(process.env.ELECTRON === 'true' ? {
      serveStatic: true,
      minify: false, // Better for Electron debugging
      storage: { 
        fs: { 
          driver: 'fs', 
          base: './.data' 
        } 
      }
    } : {})
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
    // Electron-specific runtime config
    ...(process.env.ELECTRON === 'true' ? {
      nitro: {
        envPrefix: 'NITRO_',
      },
    } : {}),
    
    public: {
      r2Id: process.env.R2_ID,
      r2Secret: process.env.R2_SECRET,
      r2Bucket: process.env.R2_BUCKET,
      r2AccountId: process.env.R2_ACCOUNT_ID,
      // Adjust base URL for Electron
      baseUrl: process.env.ELECTRON === 'true' 
        ? 'http://localhost:3000' 
        : process.env.BASE_URL
    }
  },

  image: {
    // Adjust image provider for Electron
    ...(process.env.ELECTRON === 'true' ? {
      provider: 'ipx',
      ipx: {
        dir: '.output/public'
      }
    } : {})
  },

  compatibilityDate: '2025-02-28',

  // Additional Electron-specific config
  ...(process.env.ELECTRON === 'true' ? {
    vite: {
      build: {
        rollupOptions: {
          external: ['electron']
        }
      }
    },
    experimental: {
      externalVue: false,
      inlineSSRStyles: false
    }
  } : {})
})