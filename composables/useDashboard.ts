import { createSharedComposable } from '@vueuse/core';

const _useDashboard = () => {
    const route = useRoute();
    const router = useRouter();
    const useAuth = () => useNuxtApp().$auth;
    const auth = useAuth();
    const isHelpSlideoverOpen = ref(false);
    const isNotificationsSlideoverOpen = ref(false);

    defineShortcuts({
        'd-a': () => router.push(`/${auth.session.value?.companyId}/dashboard`),
        'e-b': () => router.push(`/${auth.session.value?.companyId}/erp/billing`),
        'e-s': () => router.push(`/${auth.session.value?.companyId}/erp/sales`),
        'e-a': () => router.push(`/${auth.session.value?.companyId}/erp/accounts`),
        'p-a': () => router.push(`/${auth.session.value?.companyId}/products`),
        'p-c': () => router.push(`/${auth.session.value?.companyId}/products/categories`),
        'o-a': () => router.push(`/${auth.session.value?.companyId}/order/orders`),
        'o-b': () => router.push(`/${auth.session.value?.companyId}/order/bookings`),
        'u-a': () => router.push(`/${auth.session.value?.companyId}/users`),
        'c-a': () => router.push(`/${auth.session.value?.companyId}/client`),
        's-g': () => router.push(`/${auth.session.value?.companyId}/settings`),
        
   

        '?': () => (isHelpSlideoverOpen.value = true),
        n: () => (isNotificationsSlideoverOpen.value = true),
    });

    watch(
        () => route.fullPath,
        () => {
            isHelpSlideoverOpen.value = false;
            isNotificationsSlideoverOpen.value = false;
        },
    );

    return {
        isHelpSlideoverOpen,
        isNotificationsSlideoverOpen,
    };
};

export const useDashboard = createSharedComposable(_useDashboard);
