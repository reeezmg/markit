export default defineNuxtPlugin((nuxtApp) => {
  if (!process.client) return

  const router = useRouter()

  const handleOffline = () => {
    // store the current route before redirecting
    const currentPath = router.currentRoute.value.fullPath
    localStorage.setItem('prevRoute', currentPath)
    if (currentPath !== '/nonetwork') {
      router.replace('/nonetwork')
    }
  }

  const handleOnline = () => {
    const prevUrl = localStorage.getItem('prevRoute')
    if (prevUrl && prevUrl !== '/nonetwork') {
      localStorage.removeItem('prevRoute')
      router.replace(prevUrl)
    }
  }

  // Listen for network changes
  window.addEventListener('offline', handleOffline)
  window.addEventListener('online', handleOnline)

  // Optional: check initial state on app load
  if (!navigator.onLine) handleOffline()
})
