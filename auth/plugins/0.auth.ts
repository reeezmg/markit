import type { AuthSession } from '~~/auth/server/utils/session';

export default defineNuxtPlugin(async (nuxtApp) => {
  // Skip on error pages
  if (nuxtApp.payload.error) {
    return {};
  }

  const { data: session, refresh: updateSession } = await useFetch<AuthSession>('/api/auth/session');

  const loggedIn = computed(() => !!session.value?.email);
  const fallbackUrl = computed(() => 
  session.value?.plan === 'free' || session.value?.plan === 'lite'
    ? '/offline'
    : '/erp/billing'
)

  const redirectTo = useState<string>('redirectTo', () => '/erp/billing');

  // Only register middleware on client
  if (process.client) {
    addRouteMiddleware('auth', (to) => {
      const plan = session.value?.plan

      // Redirect away from auth pages if already logged in
      if (loggedIn.value && ['/login', '/register', '/'].includes(to.path)) {
        return fallbackUrl.value
      }

      // Block access to /erp/billing for free/lite plans
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
        (plan === 'pro')
      ) {
        return '/erp/billing'
      }

      // Original auth check
      if (to.meta.auth && !loggedIn.value && session.value?.type !== 'USER') {
        redirectTo.value = to.path
        return '/login'
      }
    }, { global: true })


    const route = useRoute();
    watch(loggedIn, async (isLoggedIn) => {
      const isStoreRoute = route.path.startsWith('/store/');
      // Handle logout case
      if (!isLoggedIn && route.meta.auth && !isStoreRoute) {
        redirectTo.value = route.path;
        await navigateTo('/login');
      }
      // Handle login case - redirect from auth pages
      else if (isLoggedIn && ['/login', '/register', '/'].includes(route.path)) {
        await navigateTo(redirectTo.value || '/erp/billing');
      }
    });

    // Initial check for logged-in users on public routes
    if (
      loggedIn.value &&
      ['/login', '/register', '/'].includes(route.path)
    ) {
      const currentRoute = useRoute();
      const query = currentRoute.query;
      const queryString = Object.keys(query).length > 0
        ? '?' + new URLSearchParams(query as Record<string, string>).toString()
        : '';

      const target = redirectTo.value || '/erp/billing';
      if (target !== currentRoute.path) {
        await navigateTo(`${target}${queryString}`);
      }
    }
  }

  return {
    provide: {
      auth: {
        session,
        loggedIn,
        updateSession,
        redirectTo,
      },
    },
  };
});