
// import ChangeLogSynchronizer from '~/composables/sync.client.js'
// import {loadPGlite} from '~/composables/db.client.js'
// export default defineNuxtPlugin(async (nuxtApp) => {
//   const db = await loadPGlite()
//   console.log('PGlite database loaded:', db)
//   const sync = new ChangeLogSynchronizer(db)
//   await sync.start()

//     const result = await db.query('SELECT * FROM products');
// console.log(result);

//   nuxtApp.provide('db', db)
//   nuxtApp.provide('sync', sync)

//   if (process.client) {
//     window.addEventListener('beforeunload', () => sync.stop())
//   }
// })
