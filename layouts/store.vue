
<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount } from 'vue';

const route = useRoute();
const clientAuth = useNuxtApp().$authClient; // Avoid multiple calls

// Mobile detection
const isMobile = ref(false);

const checkMobile = () => {
  isMobile.value = window.innerWidth < 768;
};

onMounted(() => {
  checkMobile();
  window.addEventListener('resize', checkMobile);
});

onBeforeUnmount(() => {
  window.removeEventListener('resize', checkMobile);
});


const navLinks = [
  {
    id: 'store',
    label: 'Store',
    icon: 'i-heroicons-home',
    to: formatStoreRoute(route.params.company, ''),
  },
  {
    id: 'orders',
    label: 'Orders',
    icon: 'i-heroicons-shopping-bag',
    to: formatStoreRoute(route.params.company, 'orders'),
  },
  {
    id: 'wishlist',
    label: 'Wishlist',
    icon: 'i-heroicons-heart',
    to: formatStoreRoute(route.params.company,'wishlist'),
  },
  {
    id: 'checkout',
    label: 'Cart',
    icon: 'i-heroicons-shopping-cart',
    to: formatStoreRoute(route.params.company,'checkout'),
  },
  {
    id: 'settings',
    label: 'You', // Changed from "Settings"
    icon: 'i-heroicons-user',
    to: formatStoreRoute(route.params.company,'settings'),
  },
];
</script>

<template>
  <UDashboardLayout>
    <!-- Desktop Sidebar -->
    <UDashboardPanel
      v-if="!isMobile"
      :width="250"
      :resizable="{ min: 200, max: 300 }"
      collapsible
    >
      <UDashboardNavbar>
        <template #center>
          <div class="text-lg font-bold">{{ route.params.company }}</div>
        </template>
      </UDashboardNavbar>

      <UDashboardSidebar>
        <UDashboardSidebarLinks :links="navLinks" />
        <div class="flex-1" />
        <template #footer v-if="useClientAuth().session.value?.type === 'CLIENT' && useClientAuth().session.value?.id">
          <ClientDropdown />
        </template>
      </UDashboardSidebar>
    </UDashboardPanel>

    <div
      :class="[
        'flex flex-col flex-1 w-full overflow-y-auto',
        isMobile ? 'pb-20' : '',
        'min-h-screen'
      ]"
    >
      <slot />
    </div>


    <!-- Mobile Bottom Navigation -->
    <div 
      v-if="isMobile"
      class="fixed bottom-0 left-0 right-0 bg-white dark:bg-gray-900 border-t border-gray-200 dark:border-gray-800 z-50"
    >
      <div class="flex justify-around items-center px-1 py-2">
        <NuxtLink
          v-for="link in navLinks"
          :key="link.id"
          :to="link.to"
          class="flex flex-col items-center justify-center flex-1 text-center p-1"
          active-class="text-primary-500 dark:text-primary-400"
        >
          <UIcon :name="link.icon" class="w-5 h-5" />
          <span class="text-[10px] mt-1">{{ link.label }}</span>
        </NuxtLink>
      </div>
    </div>
  </UDashboardLayout>
</template>


<style lang="postcss">
/* Ensure enough bottom space on mobile for the nav */
body {
  padding-bottom: 0; /* Reset any old settings */
}

@media (max-width: 767px) {
  body {
    padding-bottom: 60px;
  }
}

.router-link-active {
  color: var(--color-primary-500);
}

.dark .router-link-active {
  color: var(--color-primary-400);
}
</style>
