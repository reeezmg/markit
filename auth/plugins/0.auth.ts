import type { AuthSession } from '~~/auth/server/utils/session';

export default defineNuxtPlugin(async (nuxtApp) => {
    // Skip plugin when rendering error page
    if (nuxtApp.payload.error) {
        return {};
    }

    const { data: session, refresh: updateSession } =
        await useFetch<AuthSession>('/api/auth/session');

    const loggedIn: any = computed(() => !!session.value?.email);

    // Create a ref to know where to redirect the user when logged in
    const redirectTo = useState(`/dashboard`);

    addRouteMiddleware(
        'auth',
        (to) => {
            if (to.meta.auth && !loggedIn.value && session.value?.type !== 'USER') {
                redirectTo.value = to.path;
                return '/login';
            }
        },
        { global: true },
    );

    const currentRoute = useRoute();

    if (process.client) {
        watch(loggedIn, async (loggedIn) => {
            const isStoreRoute = currentRoute.path.startsWith('/store/');
            console.log('isStoreRoute', isStoreRoute);
            console.log('currentRoute', currentRoute.path);
            if (!loggedIn && currentRoute.meta.auth && !isStoreRoute) {
                redirectTo.value = currentRoute.path;
                await navigateTo('/login');
            }
        });
    }
    if (
        loggedIn.value &&
        ['/login', '/register', '/'].includes(currentRoute.path)
      ) {
        // Extract query parameters and build query string
        const queryParams = currentRoute.query;
<<<<<<< HEAD
        const queryString = Object.keys(queryParams).length > 0 
            ? '?' + new URLSearchParams(queryParams as Record<string, string>).toString()
            : '';

        // Append query string to redirectTo.value
        await navigateTo(`${redirectTo.value || `/`}${queryString}`);
    }

=======
        const queryString = Object.keys(queryParams).length > 0
          ? '?' + new URLSearchParams(queryParams as Record<string, string>).toString()
          : '';
      
        // Default to dashboard or some logged-in homepage if no redirect is specified
        const targetPath = redirectTo.value || '/dashboard';
      
        // Avoid redirecting to the same path
        if (targetPath !== currentRoute.path) {
          await navigateTo(`${targetPath}${queryString}`);
        }
      }
      
>>>>>>> main
    return {
        provide: {
            auth: {
                loggedIn,
                session,
                redirectTo,
                updateSession,
            },
        },
    };
});
