import { commerceArticles } from './data/commerce-articles'
import { relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const projectRoot = fileURLToPath(new URL('.', import.meta.url))
const auditBuildDir = process.env.MARKIT_E2E_BUILD_DIR

export default defineNuxtConfig({
  extends: ['@nuxt/ui-pro', './auth'],
  buildDir: auditBuildDir || '.nuxt',
  debug: auditBuildDir ? false : undefined,
  ignore: ['**/.nuxt/**', '**/.nuxt-branch-e2e/**', '**/.output-branch-e2e/**', 'tests/branch-reports/**', '**/*.log'],

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

  hooks: {
    'vite:compiled'() {
      // Release completed build stages on the memory-constrained audit host.
      if (auditBuildDir) (globalThis as typeof globalThis & { gc?: () => void }).gc?.();
    },
    'prepare:types'({ tsConfig }) {
      // Standalone test projects supply intentionally minimal globals. Those
      // declarations must not replace Nuxt's application/session types.
      tsConfig.exclude ||= [];
      for (const directory of ['tests', 'cypress', '.nuxt-branch-e2e']) {
        if (resolve(projectRoot, directory) === resolve(projectRoot, auditBuildDir || '.nuxt')) continue;
        const pattern = relative(resolve(projectRoot, auditBuildDir || '.nuxt'), resolve(projectRoot, directory)).replaceAll('\\', '/') + '/**';
        if (!tsConfig.exclude.includes(pattern)) tsConfig.exclude.push(pattern);
      }
    },
  },

  // Dev-only savings. Production keeps server sourcemaps so error traces stay
  // readable; generating them in dev is pure cost.
  sourcemap: process.env.NODE_ENV === 'production' && !auditBuildDir
    ? { server: true, client: false }
    : { server: false, client: false },

  experimental: {
    // Native file watching — the default watcher struggles with a tree this
    // size (130 pages, 103 components, 345 server routes) on Windows.
    watcher: 'parcel',
  },

  nitro: {
    // Large timing headers can exceed native fetch limits during SSR.
    timing: false,
    // Local audit output runs beside the installed dependencies. Avoid copying
    // and tracing that tree; Prisma's generated .prisma import needs a path.
    externals: auditBuildDir ? { trace: false } : undefined,
    alias: auditBuildDir ? { '.prisma/client': resolve(projectRoot, 'node_modules/.prisma/client').replaceAll('\\', '/') } : undefined,
    plugins: auditBuildDir ? [resolve(projectRoot, 'tests/helpers/readonly-nitro-plugin.ts')] : undefined,
    handlers: auditBuildDir ? [{ route: '/', middleware: true, handler: resolve(projectRoot, 'tests/helpers/readonly-request-middleware.ts').replaceAll('\\', '/') }] : undefined,
    preset: auditBuildDir ? 'node-server' : 'vercel',
    output: auditBuildDir ? { dir: resolve(projectRoot, '.output-branch-e2e') } : undefined,
    vercel: { functions: { maxDuration: 60 } },
    routeRules: {
      '/nonetwork': { prerender: !auditBuildDir },
      '/storelanding': { redirect: { to: '/', statusCode: 301 } },
      '/landing': { redirect: { to: '/', statusCode: 301 } },
    },
    esbuild: { options: { target: 'es2022' } }
  },

  vite: {
    define: auditBuildDir ? { __VUE_PROD_HYDRATION_MISMATCH_DETAILS__: true } : undefined,
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
        clientFiles: auditBuildDir ? [] : [
          './pages/erp/billing.vue',
          './pages/erp/edit/[salesId].vue',
          './pages/products/add.vue',
          './layouts/default.vue',
        ],
      },
    },

    // Keep the deployment's existing chunk policy. The isolated audit uses
    // route splitting to avoid loading every seller page into each test tab.
    build: {
      rollupOptions: {
        output: {
          manualChunks: auditBuildDir ? undefined : () => 'app.js'
        }
      }
    }
  },

  modules: [
    function preserveServerPrefetchIds(_options, nuxt) {
      // Vue uses registered prefetch hooks to allocate SSR-safe useId boundaries.
      // Icons register them on both sides; removing the client registration
      // shifts subsequent menu/control IDs even though no hook runs in-browser.
      const client = nuxt.options.optimization.treeShake.composables.client;
      // Dev defaults to an empty map. Adding vue: [] activates Nuxt's transform
      // with an empty regex alternative, which matches zero-length ranges.
      if (client.vue) client.vue = client.vue.filter(name => name !== 'onServerPrefetch');
    },
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

  sitemap: {
    include: ['/', '/blogs', '/blogs/**', '/terms'],
    urls: commerceArticles.map(article => `/blogs/${article.slug}`),
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
    // Private seller shipping service under server/shipping_service.
    shippingServiceUrl: process.env.SHIPPING_SERVICE_URL || 'http://localhost:8001',
    shippingServiceToken: process.env.SHIPPING_SERVICE_TOKEN || process.env.CUSTOM_API_SERVICE_TOKEN || '',
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
