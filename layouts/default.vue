<script setup lang="ts">
import { ref, computed, watch } from 'vue';

const route = useRoute();
const useAuth = () => useNuxtApp().$auth;

const { isHelpSlideoverOpen } = useDashboard();

const auth = useAuth();

const links = computed(() => {
    const baseLinks = [
        {
            id: 'home',
            label: 'Marketplace',
            icon: 'i-heroicons-home',
            to: `/`,
            tooltip: {
                text: 'Home',
                shortcuts: ['G', 'H'],
            },
        },
        {
            id: 'dashboard',
            label: 'Dashboard',
            icon: 'i-dashicons-chart-area',
            to: `/${auth.session.value?.companyId}/dashboard`,
            tooltip: {
                text: 'Dashboard',
                shortcuts: ['G', 'H'],
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
                    to: `/${auth.session.value?.companyId}/erp/billing`,
                    exact: true,
                },
                {
                    label: 'Sales',
                    to: `/${auth.session.value?.companyId}/erp/sales`,
                    exact: true,
                },
                {
                    label: 'Accounts',
                    to: `/${auth.session.value?.companyId}/erp/accounts`,
                    exact: true,
                },
            ],
            tooltip: {
                text: 'Settings',
                shortcuts: ['G', 'S'],
            },
        },
        ...(auth.session.value?.role === 'admin'
            ? [
                  {
                      id: 'users',
                      label: 'Users',
                      icon: 'i-heroicons-user-group',
                      to: `/${auth.session.value?.companyId}/users`,
                      tooltip: {
                          text: 'Users',
                          shortcuts: ['G', 'U'],
                      },
                  },
              ]
            : []),
        {
            id: 'products',
            label: 'Products',
            to: `/${auth.session.value?.companyId}/products`,
            icon: 'i-heroicons-squares-2x2',
            children: [
                {
                    label: 'All Products',
                    to: `/${auth.session.value?.companyId}/products`,
                    exact: true,
                },
                ...(auth.session.value?.role === 'admin'
                    ? [
                          {
                              label: 'Categories',
                              to: `/${auth.session.value?.companyId}/products/categories`,
                          },
                      ]
                    : []),
            ],
            tooltip: {
                text: 'products',
                shortcuts: ['G', 'P'],
            },
        },
        {
            id: 'orders',
            label: 'Orders',
            to: `/${auth.session.value?.companyId}/order`,
            icon: 'i-heroicons-shopping-bag',
            children: [
            ...(auth.session.value?.companyType === 'seller' || auth.session.value?.companyType === 'buyer'
                    ? [
                        {
                        label: 'Orders',
                        to: `/${auth.session.value?.companyId}/order/orders`,
                        exact: true,
                        },
                        {
                        label: 'Bookings',
                        to: `/${auth.session.value?.companyId}/order/bookings`, 
                        },
                      ]
                    : []),
            ],
            tooltip: {
                text: 'products',
                shortcuts: ['G', 'O'],
            },
        },
        {
            id: 'client',
            label: 'Client',
            icon: 'i-heroicons-user-plus',
            to: `/${auth.session.value?.companyId}/client`,
            tooltip: {
                text: 'Client',
                shortcuts: ['G', 'I'],
            },
        },
        {
            id: 'marketing',
            label: 'Marketing',
            icon: 'i-heroicons-briefcase',
            to: `/${auth.session.value?.companyId}/marketing`,
            tooltip: {
                text: 'Marketing',
                shortcuts: ['G', 'I'],
            },
        },
        {
            id: 'inbox',
            label: 'Inbox',
            icon: 'i-heroicons-inbox',
            to: `/${auth.session.value?.companyId}/inbox`,
            tooltip: {
                text: 'Inbox',
                shortcuts: ['G', 'I'],
            },
        },
       
        {
            id: 'crm',
            label: 'CRM',
            icon: 'i-heroicons-clipboard-document-list',
            to: `/${auth.session.value?.companyId}/crm`,
            tooltip: {
                text: 'CRM',
                shortcuts: ['G', 'I'],
            },
        },
        {
            id: 'reports',
            label: 'Reports',
            to: '/reports',
            icon: 'i-heroicons-chart-bar',
            children: [
                {
                    label: 'Sales',
                    to: `/${auth.session.value?.companyId}/reports/sales`,
                    exact: true,
                },
                // {
                //     label: 'Sales',
                //     to: `/${auth.session.value?.companyId}/reports/sales`,
                //     exact: true,
                // },
                // {
                //     label: 'Accounts',
                //     to: `/${auth.session.value?.companyId}/reports/accounts`,
                //     exact: true,
                // },
            ],
            tooltip: {
                text: 'Settings',
                shortcuts: ['G', 'S'],
            },
        },
        {
            id: 'settings',
            label: 'Settings',
            to: '/settings',
            icon: 'i-heroicons-cog-8-tooth',
            children: [
                {
                    label: 'General',
                    to: '/settings',
                    exact: true,
                },
            ],
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

watch(
    () => auth.session.value?.companyId,
    (newcompanyId) => {
        console.log('Company ID changed:', newcompanyId);
    },
);
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
