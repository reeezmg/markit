import type { AuthSession } from '~~/auth/server/utils/session'

export default defineNuxtPlugin(async (nuxtApp) => {
  const config = useRuntimeConfig()
  // Skip on error pages
  if (nuxtApp.payload.error) {
    return {}
  }

  const { data: session, refresh: updateSession } = await useFetch<AuthSession>(
    '/api/auth/session',
    { credentials: 'include' }
  )

  const loggedIn = computed(() => !!session.value?.email)
  const fallbackUrl = computed(() =>
    session.value?.plan === 'free' || session.value?.plan === 'lite'
      ? '/offline'
      : '/erp/billing'
  )

  const redirectTo = useState<string>('redirectTo', () => '/erp/billing')

  // ✅ Route persistence key
  const LAST_ROUTE_KEY = 'lastRoute'

  if (process.client) {
    // 🔹 Save last route on each navigation
    addRouteMiddleware(
      'persist-last-route',
      (to) => {
        // Don’t persist auth-related pages
        if (!['/login', '/register'].includes(to.path)) {
          localStorage.setItem(LAST_ROUTE_KEY, to.fullPath)
        }
      },
      { global: true }
    )

    // 🔹 Auth & plan restrictions middleware
    addRouteMiddleware(
      'auth',
      (to) => {
        const plan = session.value?.plan

        if (loggedIn.value && ['/login', '/register', '/'].includes(to.path)) {
          return fallbackUrl.value
        }

        if (
          loggedIn.value &&
          to.path.startsWith('/erp/billing') &&
          (plan === 'free' || plan === 'lite')
        ) {
          return '/offline'
        }
        if (
          loggedIn.value &&
          to.path.startsWith('/offline') &&
          plan === 'pro'
        ) {
          return '/erp/billing'
        }

        if (to.meta.auth && !loggedIn.value && session.value?.type !== 'USER') {
          redirectTo.value = to.path
          return '/login'
        }
      },
      { global: true }
    )

    const route = useRoute()
    watch(loggedIn, async (isLoggedIn) => {
      const isStoreRoute = route.path.startsWith('/store/')

      if (!isLoggedIn && route.meta.auth && !isStoreRoute) {
        redirectTo.value = route.path
        await navigateTo('/login')
      } else if (
        isLoggedIn &&
        ['/login', '/register', '/'].includes(route.path)
      ) {
        await navigateTo(redirectTo.value || '/erp/billing')
      }
    })

    // 🔹 Initial restore of last route
    if (loggedIn.value) {
      const savedRoute = localStorage.getItem(LAST_ROUTE_KEY)
      const currentRoute = useRoute()

      if (
        savedRoute &&
        savedRoute !== currentRoute.fullPath &&
        !['/login', '/register', '/'].includes(currentRoute.path)
      ) {
        await navigateTo(savedRoute)
      } else if (['/login', '/register', '/'].includes(currentRoute.path)) {
        const query = currentRoute.query
        const queryString =
          Object.keys(query).length > 0
            ? '?' +
              new URLSearchParams(query as Record<string, string>).toString()
            : ''

        const target = redirectTo.value || '/erp/billing'
        if (target !== currentRoute.path) {
          await navigateTo(`${target}${queryString}`)
        }
      }
    }
  }

  return {
    provide: {
      auth: {
        session,
        loggedIn,
        updateSession,
      },
    },
  }
})
