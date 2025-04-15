<script setup lang="ts">
import { ref, computed, watch } from 'vue';

const route = useRoute();
const useClientAuth = () => useNuxtApp().$authClient;
const { isHelpSlideoverOpen } = useDashboard();


const links = computed(() => {
    const baseLinks = [
        {
            id: 'store',
            label: 'Store',
            icon: 'i-heroicons-home',
            to: `/store/${route.params.company}`,
            tooltip: {
                text: 'Store',
                shortcuts: ['G', 'T'],
            },
        },
        
        
        
        {
            id: 'orders',
            label: 'Orders',
            to: `/store/${route.params.company}/orders`,
            icon: 'i-heroicons-shopping-bag',
            tooltip: {
                text: 'Orders',
                shortcuts: ['G', 'O'],
            },
        },
        {
            id: 'wishlist',
            label: 'Wishlist',
            to: `/store/${route.params.company}/wishlist`,
            icon: 'i-heroicons-heart',
            tooltip: {
                text: 'wishlist',
                shortcuts: ['G', 'O'],
            },
        },
        {
            id: 'checkout',
            label: 'Checkout',
            to: `/store/${route.params.company}/checkout`,
            icon: 'i-heroicons-shopping-cart',
            tooltip: {
                text: 'checkout',
                shortcuts: ['G', 'O'],
            },
        },
       
        {
            id: 'settings',
            label: 'Settings',
            to: `/store/${route.params.company}/settings`,
            icon: 'i-heroicons-cog-8-tooth',
            tooltip: {
                text: 'Settings',
                shortcuts: ['G', 'S'],
            },
        },
    ];

    return baseLinks;
});

const footerLinks = [
    {
        label: 'Invite people',
        icon: 'i-heroicons-plus',
        to: '/settings/members',
    },
    {
        label: 'Help & Support',
        icon: 'i-heroicons-question-mark-circle',
        click: () => (isHelpSlideoverOpen.value = true),
    },
];

const groups = computed(() => [
    {
        key: 'links',
        label: 'Go to',
        commands: links.value.map((link) => ({
            ...link,
            shortcuts: link.tooltip?.shortcuts,
        })),
    },
]);


</script>

<template>
    <UDashboardLayout>
        <UDashboardPanel
            :width="250"
            :resizable="{ min: 200, max: 300 }"
            collapsible
        >
            <UDashboardNavbar
             
            >
            <template #center>
                <div class=" text-lg font-bold">{{route.params.company}}</div>
            </template>
                 
       
            </UDashboardNavbar>

            <UDashboardSidebar>
               

                <UDashboardSidebarLinks :links="links" />

                <UDivider />

                <div class="flex-1" />

                <!-- <UDashboardSidebarLinks :links="footerLinks" /> -->

                <UDivider class="sticky bottom-0" />

                <template #footer v-if="useClientAuth().session.value?.type === 'CLIENT' && useClientAuth().session.value?.id">
                    <ClientDropdown />
                </template>
            </UDashboardSidebar>
        </UDashboardPanel>

        <slot />

        <HelpSlideover />
        <NotificationsSlideover />

        <ClientOnly>
            <LazyUDashboardSearch :groups="groups" />
        </ClientOnly>
    </UDashboardLayout>
</template>
