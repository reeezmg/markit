<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount } from 'vue';

const route = useRoute();
const useClientAuth = () => useNuxtApp().$authClient;

// Mobile detection
const isMobile = ref(false);

onMounted(() => {
  const checkMobile = () => {
    isMobile.value = window.innerWidth < 768;
  };
  
  checkMobile();
  window.addEventListener('resize', checkMobile);
  
  onBeforeUnmount(() => {
    window.removeEventListener('resize', checkMobile);
  });
});

const navLinks = [
  {
    id: 'store',
    label: 'Store',
    icon: 'i-heroicons-home',
    to: `/store/${route.params.company}`,
  },
  {
    id: 'orders',
    label: 'Orders',
    icon: 'i-heroicons-shopping-bag',
    to: `/store/${route.params.company}/orders`,
  },
  {
    id: 'wishlist',
    label: 'Wishlist',
    icon: 'i-heroicons-heart',
    to: `/store/${route.params.company}/wishlist`,
  },
  {
    id: 'checkout',
    label: 'Cart',
    icon: 'i-heroicons-shopping-cart',
    to: `/store/${route.params.company}/checkout`,
  },
  {
    id: 'settings',
    label: 'Settings',
    icon: 'i-heroicons-cog-8-tooth',
    to: `/store/${route.params.company}/settings`,
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

    <!-- Main Content -->
    <slot />

    <!-- Mobile Bottom Navigation - No Menu Button -->
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


/* Content padding for mobile */
<style lang="postcss">
/* Content padding for mobile */
body {
  padding-bottom: 60px;
}

@media (min-width: 768px) {
  body {
    padding-bottom: 0;
  }
}

/* Active link styling */
.router-link-active {
  color: var(--color-primary-500);
}

.dark .router-link-active {
  color: var(--color-primary-400);
}
</style>
