import { createSharedComposable } from '@vueuse/core';

const _useDashboard = () => {
    const route = useRoute();
    const router = useRouter();
    const isHelpSlideoverOpen = ref(false);
    const isNotificationsSlideoverOpen = ref(false);

    defineShortcuts({
        'd-d': () => router.push(`/dashboard`),
        'e-b': () => router.push(`/erp/billing`),
        'e-s': () => router.push(`/erp/sales`),
        'e-e': () => router.push(`/erp/expenses`),
        'e-r': () => router.push(`/reports/sales`),
        'p-p': () => router.push(`/products`),
        'p-c': () => router.push(`/products/categories`),
        'o-o': () => router.push(`/order/orders`),
        'o-b': () => router.push(`/order/bookings`),
        'u-u': () => router.push(`/users`),
        'c-c': () => router.push(`/client`),
        's-g': () => router.push(`/settings`),
        's-s': () => router.push(`/settings/store`),
        
   

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
