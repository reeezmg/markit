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
    transpile: []
  },

  // Dev-only savings. Production keeps server sourcemaps so error traces stay
  // readable; generating them in dev is pure cost.
  sourcemap: process.env.NODE_ENV === 'production'
    ? { server: true, client: false }
    : { server: false, client: false },

  experimental: {
    // Native file watching — the default watcher struggles with a tree this
    // size (130 pages, 103 components, 345 server routes) on Windows.
    watcher: 'parcel',
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

    // Cloudflare tunnel dev access (local.markit.co.in -> localhost:3000).
    server: {
      // Always allowed: Vite 403s any Host it doesn't know, and listing the
      // tunnel hostname costs nothing when browsing plain localhost.
      allowedHosts: ['local.markit.co.in'],
      // HMR is the part that must be gated — pointing the websocket at the
      // tunnel breaks hot reload on localhost. Set TUNNEL_HOST=local.markit.co.in
      // only when you intend to develop through the tunnel.
      hmr: process.env.TUNNEL_HOST
        ? { protocol: 'wss', host: process.env.TUNNEL_HOST, clientPort: 443 }
        : undefined,

      // Pre-transform the heaviest pages instead of compiling them on first
      // visit. Costs nothing at startup — Vite warms these in the background.
      warmup: {
        clientFiles: [
          './pages/erp/billing.vue',
          './pages/erp/edit/[salesId].vue',
          './pages/products/add.vue',
          './layouts/default.vue',
        ],
      },
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

  // Measured at 6-21s of startup setup plus its own client bundle. Re-enable
  // (or run `NUXT_DEVTOOLS=true nuxt dev`) when you actually need it.
  devtools: { enabled: process.env.NUXT_DEVTOOLS === 'true' },

  runtimeConfig: {
    sessionSecret: process.env.SESSION_SECRET,
    sourceId: process.env.SOURCE_ID,
    secret: process.env.SECRET,
    // custom-api (FastAPI) — server-only; seller shipping ops proxy through here.
    customApiUrl: process.env.CUSTOM_API_URL || 'http://localhost:8000',
    customApiServiceToken: process.env.CUSTOM_API_SERVICE_TOKEN || '',
    geminiApiKey: process.env.GEMINI_API_KEY || '',
    // Encrypts seller-supplied AI credentials at rest. A dedicated secret is
    // preferred; auth.password remains a migration-safe fallback.
    aiProviderEncryptionKey: process.env.AI_PROVIDER_ENCRYPTION_KEY || '',
    githubStorefront: {
      appId: process.env.GITHUB_STOREFRONT_APP_ID || '',
      privateKey: process.env.GITHUB_STOREFRONT_PRIVATE_KEY || '',
      installationId: process.env.GITHUB_STOREFRONT_INSTALLATION_ID || '',
      owner: process.env.GITHUB_STOREFRONT_OWNER || 'Markit-Store',
      templateRepository: process.env.GITHUB_STOREFRONT_TEMPLATE_REPOSITORY || 'storefront-starter',
    },
    // AI token pricing for /ai/usage. Google publishes list rates in USD per 1M
    // tokens; these are estimates for the antigravity agent and are meant to be
    // updated from env when Google changes pricing. costMultiplier is the seller
    // markup applied on top of the converted INR amount.
    aiUsage: {
      costMultiplier: process.env.AI_COST_MULTIPLIER || '2.5',
      cachedInputMultiplier: process.env.AI_CACHED_INPUT_MULTIPLIER || '0.25',
      usdToInr: process.env.AI_USD_TO_INR || '88',
      storefrontInputUsdPerMillion: process.env.AI_STOREFRONT_INPUT_USD_PER_M || '1.25',
      storefrontOutputUsdPerMillion: process.env.AI_STOREFRONT_OUTPUT_USD_PER_M || '10',
    },
    vercelStorefront: {
      token: process.env.VERCEL_STOREFRONT_TOKEN || '',
      teamId: process.env.VERCEL_STOREFRONT_TEAM_ID || '',
      apiBaseUrl: process.env.VERCEL_STOREFRONT_API_BASE_URL || 'https://markit-custom-api.vercel.app/api',
      // Pushed to each storefront as VITE_EDITOR_ORIGIN — the origin its
      // preview/element-picker channel trusts. Without it the preview is inert.
      editorOrigin: process.env.VERCEL_STOREFRONT_EDITOR_ORIGIN || 'http://localhost:3000,https://local.markit.co.in,https://markit.co.in',
    },

    // Cloudflare R2 credentials are server-only. Never place these under
    // runtimeConfig.public because public runtime config is sent to browsers.
    r2Id: process.env.R2_ID || '',
    r2Secret: process.env.R2_SECRET || '',
    r2Bucket: process.env.R2_BUCKET || '',
    r2AccountId: process.env.R2_ACCOUNT_ID || '',

    public: {
      baseUrl: process.env.BASE_URL,
      serverUrl: process.env.SERVER_URL,
      storefrontUrl: process.env.STOREFRONT_URL || 'http://localhost:5173',
      // Edit-session container (Cloud Run) — the storefront chat sends prompts here.
      storefrontEditorUrl: process.env.STOREFRONT_EDITOR_URL || 'https://storefront-sandbox-68712209533.us-central1.run.app',
    }
  },

  image: {},

  icon: {
    // Bundle the installed @iconify-json collections into the server build.
    // 'remote' resolved every icon over the network at render time even though
    // both collections are already installed locally.
    serverBundle: {
      collections: ['heroicons', 'simple-icons']
    }
  },

  compatibilityDate: '2025-02-28'
})
