import type { AuthClientSession } from '~~/auth/server/utils/clientSession';

export default defineNuxtPlugin(async (nuxtApp) => {
    if (nuxtApp.payload.error) {
        return {};
    }

    const { data: session, refresh: updateSession } =
        await useFetch<AuthClientSession>('/api/clientauth/session');
    const loggedIn: any = computed(() => !!session.value?.phone);

    return {
        provide: {
            authClient: {
                loggedIn,
                session,
                updateSession,
            },
        },
    };
});
