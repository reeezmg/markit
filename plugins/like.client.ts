export default defineNuxtPlugin(async (nuxtApp) => {
  // Only run on client side
  if (process.server) return
  
  const likeStore = useLikeStore()
  
  // Skip if already hydrated
  if (likeStore.isHydrated) {
    console.debug('Like store already hydrated')
    return
  }

  try {
    console.time('LikeStore hydration')
    await likeStore.hydrate()
    console.debug('Like store hydrated successfully in', console.timeEnd('LikeStore hydration'))
    
    // Debug log the loaded items
    console.debug('Hydrated like items:', likeStore.likedItems.length)
  } catch (error) {
    console.error('Like store hydration failed:', error)
    
    // Optional: Add error tracking (Sentry, etc.)
    // useTrackError('like_store_hydration', error)
    
    // Clear potentially corrupted state
    likeStore.clearLocalStorage()
  }
})