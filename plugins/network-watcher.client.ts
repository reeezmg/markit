import { useRouter } from 'vue-router'
import { Capacitor } from '@capacitor/core'
import { Network } from '@capacitor/network'

export default defineNuxtPlugin((nuxtApp) => {
  if (!process.client) return

  const router = useRouter()

  const handleOffline = () => {
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

  // ✅ If running inside Capacitor app
  if (Capacitor.isNativePlatform()) {
    console.log('📱 Using Capacitor Network plugin')
    // Initial check
    Network.getStatus().then(status => {
      if (!status.connected) handleOffline()
    })
    // Subscribe to native network changes
    Network.addListener('networkStatusChange', (status) => {
      if (status.connected) handleOnline()
      else handleOffline()
    })
  } else {
    // ✅ Fallback for normal web environment
    console.log('🌐 Using browser network events')
    window.addEventListener('offline', handleOffline)
    window.addEventListener('online', handleOnline)
    if (!navigator.onLine) handleOffline()
  }
})
