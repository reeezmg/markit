import { defineNuxtPlugin } from '#app'
import { Capacitor } from '@capacitor/core'

export default defineNuxtPlugin((nuxtApp) => {
  // Detect if running inside a native Capacitor WebView
  const isNative = Capacitor.isNativePlatform()


  // Choose base URL
  const baseURL = isNative
    ? 'https://markit.co.in'       
    : 'https://markit.co.in'

  // Override global fetch
  nuxtApp.$fetch = $fetch.create({
    baseURL,
    credentials: 'include', // if you use cookies
  })
})
