<script setup lang="ts">
import { ref, computed, watch } from 'vue';

const route = useRoute();
const useAuth = () => useNuxtApp().$auth;

const { isHelpSlideoverOpen } = useDashboard();

const auth = useAuth();

const links = computed(() => {
    const baseLinks = [
        {  
            id: 'dashboard',
            label: 'Dashboard',    
            icon: 'i-heroicons-home',
            to: `/dashboard`,
            tooltip: {
                text: 'Dashboard',
                shortcuts: ['G', 'D'],
            },
        },
        {   
            id: 'erp',     
            label: 'ERP',
            to: '/erp',
            icon: 'i-heroicons-credit-card',
            children: [
                {
                    label: 'Billing',
                    to: `/erp/billing`,
                    tooltip: {
                        text: 'ERP',
                        shortcuts: ['E', 'B'],
                    },
                    exact: true,
                },
                {
                    label: 'Sales',
                    to: `/erp/sales`,
                    tooltip: {
                        text: 'ERP',
                        shortcuts: ['E', 'S'],
                    },
                },
                {
                    label: 'Accounts',
                    to: `/erp/accounts`,
                    tooltip: {
                        text: 'ERP',
                        shortcuts: ['E', 'S'],
                    },
                },
            ],
        },
        {
            id: 'products',
            label: 'Products',
            to: `/products`,
            icon: 'i-heroicons-squares-2x2',
            children: [
                {
                    label: 'All Products',
                    to: `/products`,
                    exact: true,
                    tooltip: {
                        text: 'products',
                        shortcuts: ['P', 'A'],
                    },
                },
                ...(auth.session.value?.role === 'admin'
                    ? [
                          {
                              label: 'Categories',
                              to: `/products/categories`,
                              tooltip: {
                                text: 'products',
                                shortcuts: ['P', 'C'],
                                },
                          },
                      ]
                    : []),
            ],
           
        },
        {
            id: 'orders',
            label: 'Orders',
            to: `/order`,
            icon: 'i-heroicons-shopping-bag',
            children: [
            ...(auth.session.value?.companyType === 'seller' || auth.session.value?.companyType === 'buyer'
                    ? [
                        {
                        label: 'Orders',
                        to: `/order/orders`,
                        exact: true,
                        tooltip: {
                            text: 'Orders',
                            shortcuts: ['O', 'S'],
                        },
                        },
                        {
                        label: 'Bookings',
                        to: `/order/bookings`, 
                        tooltip: {
                            text: 'Bookings',
                            shortcuts: ['O', 'B'],
                        },
                        },
                      ]
                    : []),
            ],
           
        },
        ...(auth.session.value?.role === 'admin'
            ? [
                  {
                      id: 'users',
                      label: 'Users',
                      icon: 'i-heroicons-user-group',
                      to: `/users`,
                      tooltip: {
                          text: 'Users',
                          shortcuts: ['U', 'A'],
                      },
                  },
              ]
            : []),
        {
            id: 'client',
            label: 'Client',
            icon: 'i-heroicons-user-plus',
            to: `/client`,
            tooltip: {
                text: 'Client',
                shortcuts: ['C', 'A'],
            },
        },
        
        {
            id: 'settings',
            label: 'Settings',
            to: `/settings`,
            icon: 'i-heroicons-cog-8-tooth',
            children: [
                {
                    label: 'General',
                    to: `/settings`,
                    exact: true,
                    tooltip: {
                        text: 'Settings',
                        shortcuts: ['S', 'G'],
                    },
                },
            ],

        },
    ];

    return baseLinks;
});

const footerLinks = [
   
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
                class="!border-transparent"
                :ui="{ left: 'flex-1' }"
            >
                <template #left>
                    <TeamsDropdown />
                </template>
            </UDashboardNavbar>

            <UDashboardSidebar>
                <template #header>
                    <UDashboardSearchButton />
                </template>

                <UDashboardSidebarLinks :links="links" />

                <UDivider />

                <div class="flex-1" />

                <!-- <UDashboardSidebarLinks :links="footerLinks" /> -->

                <UDivider class="sticky bottom-0" />

                <template #footer>
                    <UserDropdown />
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
