import { PGlite } from '@electric-sql/pglite'
import { type PGliteWithLive, live } from '@electric-sql/pglite/live'
import { electricSync } from '@electric-sql/pglite-sync'
import localSchemaMigrations from '~/sql/local-schema.sql?raw'


const DATA_DIR = 'idb://my-database'

const registry = new Map<string, Promise<PGliteWithLive>>()

export async function loadPGlite(): Promise<PGliteWithLive> {
  let loadingPromise = registry.get('loadingPromise')

  if (!loadingPromise) {
    loadingPromise = _loadPGlite()
    registry.set('loadingPromise', loadingPromise)
  }

  return loadingPromise as Promise<PGliteWithLive>
}

async function  _loadPGlite(): Promise<PGliteWithLive> {
  const config = useRuntimeConfig()
  const electricApiUrl = config.public.electricUrl

  const pglite: PGliteWithLive = await PGlite.create(DATA_DIR, {
    extensions: {
      electric: electricSync(),
      live,
    },
  })

  await pglite.exec(localSchemaMigrations)
await pglite.electric.syncShapesToTables({
  shapes: {
    products: {
      shape: {
        url: config.public.electricApiUrl,
        params: { table: 'products' }
      },
      table: 'products_synced',
      primaryKey: ['id']
    },
    categories: {
      shape: {
        url: config.public.electricApiUrl,
        params: { table: 'categories' }
      },
      table: 'categories_synced',
      primaryKey: ['id']
    },
    variants: {
      shape: {
        url: config.public.electricApiUrl,
        params: { table: 'variants' }
      },
      table: 'variants_synced',
      primaryKey: ['id']
    },
    items: {
      shape: {
        url: config.public.electricApiUrl,
        params: { table: 'items' }
      },
      table: 'items_synced',
      primaryKey: ['id']
    }
  },
  key: 'my-sync-v2', // Optional: remove or rename as needed
  onInitialSync: () => {
    console.log('Initial sync complete')
  }
}).catch(err => console.error('❌ Sync failed', err))


  return pglite
}
