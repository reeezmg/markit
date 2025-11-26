import type { PGliteWithLive } from '@electric-sql/pglite/live'
import type ChangeLogSynchronizer from '~/composables/sync.client'

declare module '#app' {
  interface NuxtApp {
    $db: PGliteWithLive
    $sync: ChangeLogSynchronizer
  }
}
