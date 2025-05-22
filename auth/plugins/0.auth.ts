import type { AuthSession } from '~~/auth/server/utils/session';

export default defineNuxtPlugin(async (nuxtApp) => {
  // Skip on error pages
  if (nuxtApp.payload.error) {
    return {};
  }

  const { data: session, refresh: updateSession } = await useFetch<AuthSession>('/api/auth/session');

  const loggedIn = computed(() => !!session.value?.email);
  const redirectTo = useState<string>('redirectTo', () => '/dashboard');

  // Only register middleware on client
  if (process.client) {
    addRouteMiddleware('auth', (to) => {
      if (to.meta.auth && !loggedIn.value && session.value?.type !== 'USER') {
        redirectTo.value = to.path;
        return '/login';
      }
    }, { global: true });

    const route = useRoute();
    watch(loggedIn, async (isLoggedIn) => {
      const isStoreRoute = route.path.startsWith('/store/');
      if (!isLoggedIn && route.meta.auth && !isStoreRoute) {
        redirectTo.value = route.path;
        await navigateTo('/login');
      }
    });

    // Handle redirect if already logged in and on public routes
    if (
      loggedIn.value &&
      ['/login', '/register', '/'].includes(useRoute().path)
    ) {
      const currentRoute = useRoute();
      const query = currentRoute.query;
      const queryString = Object.keys(query).length > 0
        ? '?' + new URLSearchParams(query as Record<string, string>).toString()
        : '';

      const target = redirectTo.value || '/dashboard';
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
