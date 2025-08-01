<script setup lang="ts">
import { ref, computed, watch } from 'vue';

const route = useRoute();
const useAuth = () => useNuxtApp().$auth;
const plan = ref(useAuth().session.value?.plan || 'free');

const { isHelpSlideoverOpen } = useDashboard();

const auth = useAuth();

const links = computed(() => {
    const simplifiedLinks = [
    {
      id: 'dashboard',
      label: 'Dashboard',
      icon: 'i-heroicons-home',
      to: `/dashboard`,
      tooltip: {
        text: 'Dashboard',
        shortcuts: ['D', 'D'],
      },
    },
    {
    id: 'offline',
    label: 'Offline',
    to: '/offline',
    icon: 'i-heroicons-no-symbol',
    tooltip: {
        text: 'Adjust stock for offline/manual sales',
        shortcuts: ['P', 'O'],
    },
    },

    {
      id: 'sales',
      label: 'Sales',
      to: `/erp/sales`,
      icon: 'i-heroicons-chart-bar',
      tooltip: {
        text: 'Sales',
        shortcuts: ['E', 'S'],
      },
    },
    {
      id: 'reports',
      label: 'Reports',
      to: `/reports/sales`,
      icon: 'i-heroicons-book-open',
      tooltip: {
        text: 'Reports',
        shortcuts: ['R', 'S'],
      },
    },
    {
      id: 'products',
      label: 'Products',
      to: `/products`,
      icon: 'i-heroicons-squares-2x2',
      tooltip: {
        text: 'Products',
        shortcuts: ['P', 'P'],
      },
    },
    {
      id: 'categories',
      label: 'Categories',
      to: `/products/categories`,
      icon: 'i-heroicons-rectangle-group',
      tooltip: {
        text: 'Categories',
        shortcuts: ['P', 'C'],
      },
    },
    {
      id: 'stocks',
      label: 'Stocks',
      to: `/products/stocks`,
      icon: 'i-heroicons-archive-box',
      tooltip: {
        text: 'Stocks',
        shortcuts: ['P', 'S'],
      },
    },
    {
      id: 'orders',
      label: 'Orders',
      to: `/order/orders`,
      icon: 'i-heroicons-shopping-bag',
      tooltip: {
        text: 'Orders',
        shortcuts: ['O', 'O'],
      },
    },
    {
      id: 'bookings',
      label: 'Bookings',
      to: `/order/bookings`,
      icon: 'i-heroicons-bookmark',
      tooltip: {
        text: 'Bookings',
        shortcuts: ['O', 'B'],
      },
    },
    {
      id: 'users',
      label: 'Users',
      icon: 'i-heroicons-user-group',
      to: `/users`,
      tooltip: {
        text: 'Users',
        shortcuts: ['U', 'U'],
      },
    },
    {
      id: 'client',
      label: 'Client',
      icon: 'i-heroicons-user-plus',
      to: `/client`,
      tooltip: {
        text: 'Client',
        shortcuts: ['C', 'C'],
      },
    },
    {
      id: 'settings',
      label: 'Settings',
      to: `/settings`,
      icon: 'i-heroicons-cog-8-tooth',
      tooltip: {
        text: 'Settings',
        shortcuts: ['S', 'G'],
      },
    },
  ];

    const baseLinks = [
        {  
            id: 'dashboard',
            label: 'Dashboard',    
            icon: 'i-heroicons-home',
            to: `/dashboard`,
            tooltip: {
                text: 'Dashboard',
                shortcuts: ['D', 'D'],
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
                    label: 'Expenses',
                    to: `/erp/expenses`,
                    tooltip: {
                        text: 'ERP',
                        shortcuts: ['E', 'E'],
                    },
                },
                {
                    label: 'Accounts',
                    to: `/erp/accounts`,
                    tooltip: {
                        text: 'Accounts',
                        shortcuts: ['E', 'A'],
                    },
                },
            ],
        },
        {   
            id: 'reports',     
            label: 'Reports',
            to: '/reports',
            icon: 'i-heroicons-book-open',
            children: [
                  {
                    label: 'Sales',
                    to: `/reports/sales`,
                    tooltip: {
                        text: 'Reports',
                        shortcuts: ['R', 'S'],
                    },
                    },
                  {
                    label: 'Users',
                    to: `/reports/users`,
                    tooltip: {
                        text: 'Reports',
                        shortcuts: ['R', 'U'],
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
                        shortcuts: ['P', 'P'],
                    },
                },

                   {
                    label: 'Categories',
                    to: `/products/categories`,
                    tooltip: {
                    text: 'products',
                    shortcuts: ['P', 'C'],
                    },
                },
                     {
                    label: 'Stocks',
                    to: `/products/stocks`,
                    tooltip: {
                        text: 'stocks',
                        shortcuts: ['P', 'S'],
                    },
                },
            ],
           
        },
        {
            id: 'distributor',
            label: 'Distributor',
            to: `/distributor`,
            icon: 'i-heroicons-truck',
            children: [
                {
                    label: 'All Distributor',
                    to: `/distributor`,
                    exact: true,
                    tooltip: {
                        text: 'distributors',
                        shortcuts: ['D', 'D'],
                    },
                },
                // {
                //     label: 'Order',
                //     to: `/distributor/Order`,
                //     exact: true,
                //     tooltip: {
                //         text: 'Order',
                //         shortcuts: ['D', 'O'],
                //     },
                // },
                {
                    label: 'Credit',
                    to: `/distributor/credit`,
                    exact: true,
                    tooltip: {
                        text: 'Credit',
                        shortcuts: ['D', 'C'],
                    },
                },
               
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
                            shortcuts: ['O', 'O'],
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
        
                  {
                      id: 'users',
                      label: 'Users',
                      icon: 'i-heroicons-user-group',
                      to: `/users`,
                      tooltip: {
                          text: 'Users',
                          shortcuts: ['U', 'U'],
                      },
                  },
              
      
        {
            id: 'client',
            label: 'Client',
            icon: 'i-heroicons-user-plus',
            to: `/client`,
            tooltip: {
                text: 'Client',
                shortcuts: ['C', 'C'],
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
                {
                    label: 'Store',
                    to: `/settings/store`,
                    exact: true,
                    tooltip: {
                        text: 'Settings',
                        shortcuts: ['S', 'S'],
                    },
                },
            ],

        },
    ];

      if (plan.value === "free" || plan.value === "lite" ) {
    return simplifiedLinks;
  }

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
