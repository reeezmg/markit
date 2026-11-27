// Nuxt services only; the browser fixture imports the real Nuxt UI components.
import { ref, useId as vueUseId } from 'vue'
export const appConfig = { ui: { primary: 'orange', gray: 'cool', strategy: 'merge', colors: ['primary','gray','red','orange','green','blue'] } }
export default appConfig
export const useAppConfig = () => appConfig
export const useId = vueUseId
export const useHead = () => {}
export const useRoute = () => (window as any).testRoute
export const useRouter = () => ({ push: (to: any) => (window as any).navigateTo(to) })
export const useNuxtApp = () => ({ $config: {}, hook: () => {}, $i18n: undefined })
export const useRuntimeConfig = () => ({ public: {}, app: { baseURL: '/' } })
export const useColorMode = () => ref('light')

export const useToast = () => ({ add: (notification: any) => {
  const target = window as any
  ;(target.crmToasts ||= []).push(notification)
  let host = document.querySelector('#test-toasts')
  if (!host) { host = document.createElement('div'); host.id = 'test-toasts'; host.setAttribute('aria-live', 'polite'); document.body.append(host) }
  host.textContent = notification.title
  return notification
} })
