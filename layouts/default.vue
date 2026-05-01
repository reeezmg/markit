<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import AiChatChatBox from '~/components/AiChat/ChatBox.vue';
import {
    useCountTrynbuy
} from '~/lib/hooks';

const checkoutStore = useCheckoutStore()

const route = useRoute();
const useAuth = () => useNuxtApp().$auth;
const cleanupUnlocked = useState('cleanup-unlocked', () => false)
const showSidebar = computed(() =>
  route.path !== '/cleanup' || cleanupUnlocked.value
)
const isSidebarCollapsed = ref(false)
const plan = ref(useAuth().session.value?.plan || 'free');

const { isHelpSlideoverOpen } = useDashboard();

const auth = useAuth();
const isUserTrackIncluded = ref(useAuth().session.value?.isUserTrackIncluded);

const { data: orderCount, refetch } = useCountTrynbuy({
  where: {
    company: {
      some: { id: useAuth().session.value?.companyId }, 
    },
    orderStatus: 'ORDER_RECEIVED',
  },
})


watch(orderCount,(val) => {
    console.log(val)
})

watch(() => checkoutStore.lastUpdate, async () => await refetch(), { immediate: true })

onMounted(() => {
  const saved = localStorage.getItem('storetools_sidebar_collapsed')
  isSidebarCollapsed.value = saved === 'true'
})

watch(isSidebarCollapsed, (collapsed) => {
  localStorage.setItem('storetools_sidebar_collapsed', String(collapsed))
})

const toggleSidebar = () => {
  isSidebarCollapsed.value = !isSidebarCollapsed.value
}




const links = computed(() => {
    const simplifiedLinks = [
    // {
    //   id: 'dashboard',
    //   label: 'Dashboard',
    //   icon: 'i-heroicons-home',
    //   to: `/dashboard`,
    //   tooltip: {
    //     text: 'Dashboard',
    //     shortcuts: ['D', 'D'],
    //   },
    // },
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
      id: 'online',
      label: 'Online',
      to: `/erp/online`,
      icon: 'i-heroicons-shopping-bag',
      tooltip: {
        text: 'Online Sales',
        shortcuts: ['E', 'O'],
      },
    },
    {
      id: 'reports',
      label: 'Reports',
      to: `/reports/online`,
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
      id: 'brands',
      label: 'Brands',
      to: `/products/brands`,
      icon: 'i-heroicons-tag',
      tooltip: {
        text: 'Brands',
        shortcuts: ['P', 'B'],
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
      id: 'trynbuy',
      label: 'Try N Buy',
      to: `/order/trynbuy`,
      icon: 'i-heroicons-shopping-bag',
      ...(orderCount.value ? { badge: `${orderCount.value}` } : {}),
      tooltip: {
        text: 'trynbuy',
        shortcuts: ['O', 'T'],
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
        // {  
        //     id: 'dashboard',
        //     label: 'Dashboard',    
        //     icon: 'i-heroicons-home',
        //     to: `/dashboard`,
        //     tooltip: {
        //         text: 'Dashboard',
        //         shortcuts: ['D', 'D'],
        //     },
        // },
        {   
            id: 'erp',     
            label: 'ERP',
            to: '/erp',
            icon: 'i-heroicons-credit-card',
            children: [
                ...(auth.session.value?.companyType === 'service'
                    ? [
                        {
                            label: 'Quotes',
                            to: `/quotes`,
                            tooltip: { text: 'Quotes', shortcuts: ['E', 'Q'] },
                            exact: true,
                        },
                        {
                            label: 'Sales Orders',
                            to: `/sales-orders`,
                            tooltip: { text: 'Sales Orders', shortcuts: ['E', 'O'] },
                        },
                        {
                            label: 'Invoices',
                            to: `/invoices`,
                            tooltip: { text: 'Invoices', shortcuts: ['E', 'I'] },
                            exact: true,
                        },
                        {
                            label: 'Payments Received',
                            to: `/payments`,
                            tooltip: { text: 'Payments Received', shortcuts: ['E', 'P'] },
                            exact: true,
                        },
                    ]
                    : [
                        {
                            label: 'Billing',
                            to: `/erp/billing`,
                            tooltip: { text: 'ERP', shortcuts: ['E', 'B'] },
                            exact: true,
                        },
                        {
                            label: 'Sales',
                            to: `/erp/sales`,
                            tooltip: { text: 'ERP', shortcuts: ['E', 'S'] },
                        },
                        {
                            label: 'Online',
                            to: `/erp/online`,
                            tooltip: { text: 'Online Sales', shortcuts: ['E', 'O'] },
                        },
                    ]),
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
        ...(auth.session.value?.companyType === 'service'
            ? [{
                id: 'projects',
                label: 'Projects',
                to: '/projects',
                icon: 'i-heroicons-briefcase',
                tooltip: { text: 'Projects', shortcuts: ['P'] },
            }]
            : []),
        {
        id: 'reports',
        label: 'Reports',
        to: '/reports',
        icon: 'i-heroicons-book-open',
        children: [
        ...(auth.session.value?.type === 'admin' || auth.session.value?.type === 'manager'
            ? [
            {
            label: 'Daily',
            to: `/reports/daily`,
            tooltip: {
                text: 'Reports',
                shortcuts: ['R', 'S'],
            },
            },
            ]
            : []),
            ...(auth.session.value?.type === 'admin'
            ? [
            {
            label: 'Summary',
            to: `/reports/summary`,
            tooltip: {
                text: 'Business Summary',
                shortcuts: ['R', 'M'],
            },
            },
            ]
            : []),
            ...(auth.session.value?.type === 'admin'
            ? [
            {
            label: 'Profit',
            to: `/reports/profit`,
            tooltip: {
                text: 'Profit Report',
                shortcuts: ['P', 'R'],
            },
            },
            ]
            : []),
            ...(auth.session.value?.type === 'admin'
            ? [
            {
            label: 'Accounts',
            to: `/reports/accounts`,
            tooltip: {
                text: 'Accounts Report',
                shortcuts: ['A', 'R'],
            },
            },
            ]
            : []),
            ...(auth.session.value?.type === 'admin'
            ? [
            {
            label: 'GST',
            to: `/reports/gst`,
            tooltip: {
                text: 'GST Returns',
                shortcuts: ['G', 'T'],
            },
            },
            ]
            : []),
            {
            label: 'Online',
            to: `/reports/online`,
            tooltip: {
                text: 'Reports',
                shortcuts: ['O', 'S'],
            },
            },
            ...(isUserTrackIncluded.value
            ? [
                {
                    label: 'Users',
                    to: `/reports/users`,
                    tooltip: {
                    text: 'Reports',
                    shortcuts: ['R', 'U'],
                    },
                },
                ]
            : []),
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
                    label: 'Brands',
                    to: `/products/brands`,
                    tooltip: {
                    text: 'products',
                    shortcuts: ['P', 'B'],
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
                {
                    label: 'Purchase Order',
                    to: `/distributor/purchaseOrder`,
                    exact: true,
                    tooltip: {
                        text: 'Purchase Order',
                        shortcuts: ['D', 'O'],
                    },
                },
                {
                    label: 'Purchase Return',
                    to: `/distributor/purchase-return`,
                    exact: true,
                    tooltip: {
                        text: 'Purchase Return',
                        shortcuts: ['D', 'R'],
                    },
                },
                // {
                //     label: 'Credit',
                //     to: `/distributor/credit`,
                //     exact: true,
                //     tooltip: {
                //         text: 'Credit',
                //         shortcuts: ['D', 'C'],
                //     },
                // },
               
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
                        id: 'trynbuy',
                        label: 'Try N Buy',
                        to: `/order/trynbuy`,
                        ...(orderCount.value ? { badge: `${orderCount.value}` } : {}),
                        tooltip: {
                            text: 'trynbuy',
                            shortcuts: ['O', 'T'],
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
            id: 'accounts',
            label: 'Accounts',
            to: `/accounts`,
            icon: 'i-heroicons-squares-2x2',
            children: [
                {
                    label: 'Banks',
                    to: `/accounts/bank`,
                    exact: true,
                    tooltip: {
                        text: 'Banks',
                        shortcuts: ['A', 'B'],
                    },
                },
                {
                    label: 'Cash',
                    to: `/accounts/cash`,
                    exact: true,
                    tooltip: {
                        text: 'Cash',
                        shortcuts: ['A', 'C'],
                    },
                },
                                {
                    label: 'Investments',
                    to: `/accounts/investment`,
                    tooltip: {
                    text: 'investments',
                    shortcuts: ['A', 'I'],
                    },
                },
                {
                    label: 'Transfers',
                    to: `/accounts/transfer`,
                    tooltip: {
                    text: 'transfers',
                    shortcuts: ['A', 'T'],
                    },
                },
                {
                    label: 'Transactions',
                    to: `/accounts/transaction`,
                    exact: true,
                    tooltip: {
                        text: 'transactions',
                        shortcuts: ['A', 'T'],
                    },
                }
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
            id: 'Coupons',
            label: 'Coupons',
            icon: 'i-heroicons-ticket',
            to: `/coupon`,
            tooltip: {
                text: 'Coupons',
                shortcuts: ['C', 'P'],
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
                {
                    label: 'Printer',
                    to: `/settings/printer`,
                    exact: true,
                    tooltip: {
                        text: 'Settings',
                        shortcuts: ['S', 'P'],
                    },
                },
                {
                    label: 'Numbering',
                    to: `/settings/numbering`,
                    exact: true,
                    tooltip: {
                        text: 'Numbering & Prefixes',
                        shortcuts: ['S', 'N'],
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

const isRouteActive = (to?: string) => {
  if (!to) return false
  return route.path === to || route.path.startsWith(`${to}/`)
}

</script>

<template>
    <UDashboardLayout>
        <UDashboardPanel
            v-if="showSidebar && !isSidebarCollapsed"
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
                <template #right>
                    <UButton
                        icon="i-heroicons-chevron-double-left"
                        color="gray"
                        variant="ghost"
                        @click="toggleSidebar"
                    />
                </template>
            </UDashboardNavbar>

            <UDashboardSidebar>
                <template #header>
                    <UDashboardSearchButton />
                </template>

                <UDashboardSidebarLinks :links="links" />

                <UDivider />

                <div class="flex-1" />

                <UDivider class="sticky bottom-0" />

                <template #footer>
                    <UserDropdown />
                </template>
            </UDashboardSidebar>
        </UDashboardPanel>

        <UDashboardPanel
          v-else-if="showSidebar && isSidebarCollapsed"
          :width="64"
        >
          <UDashboardNavbar class="!border-transparent" :ui="{ left: 'justify-center' }">
            <template #left>
              <UButton
                icon="i-heroicons-chevron-double-right"
                color="gray"
                variant="ghost"
                @click="toggleSidebar"
              />
            </template>
          </UDashboardNavbar>

          <UDashboardSidebar>
            <div class="flex flex-col items-center gap-2 py-2">
              <template v-for="link in links" :key="link.id || link.label">
                <UPopover
                  v-if="link.children?.length"
                  mode="hover"
                  :popper="{ placement: 'right-start', strategy: 'fixed' }"
                >
                  <UButton
                    :icon="link.icon || 'i-heroicons-squares-2x2'"
                    color="gray"
                    :variant="isRouteActive(link.to) ? 'soft' : 'ghost'"
                    class="w-10 h-10 justify-center"
                  />

                  <template #panel>
                    <div class="w-60 p-2">
                      <div class="text-sm font-medium px-2 py-1">{{ link.label }}</div>
                      <div class="space-y-1">
                        <NuxtLink
                          v-for="child in link.children"
                          :key="child.to || child.label"
                          :to="child.to"
                          class="block px-2 py-1.5 rounded text-sm hover:bg-gray-100 dark:hover:bg-gray-800"
                        >
                          {{ child.label }}
                        </NuxtLink>
                      </div>
                    </div>
                  </template>
                </UPopover>

                <UTooltip v-else :text="link.label">
                  <UButton
                    :to="link.to"
                    :icon="link.icon || 'i-heroicons-squares-2x2'"
                    color="gray"
                    :variant="isRouteActive(link.to) ? 'soft' : 'ghost'"
                    class="w-10 h-10 justify-center"
                  />
                </UTooltip>
              </template>
            </div>

            <div class="flex-1" />

            <div class="pb-2 flex justify-center">
              <UserDropdown compact />
            </div>
          </UDashboardSidebar>
        </UDashboardPanel>

        <slot />

        <HelpSlideover />
        <NotificationsSlideover />
        <AiChatChatBox />
        

        <ClientOnly>
            <LazyUDashboardSearch :groups="groups" />
        </ClientOnly>
    </UDashboardLayout>
</template>
