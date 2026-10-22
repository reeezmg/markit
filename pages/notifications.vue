<script setup lang="ts">
definePageMeta({ auth: true, key: route => route.path + String(route.query.entryCompany || '') });
const companyScope = useCompanyScope('form', true);
await companyScope.ready;

const { notifications, unreadCount, markAllAsRead, typeConfigs, getAction, isLoading, error, fetchNotifications } = useNotifications(companyScope);
const activeTab = ref(0);
const markingAll = ref(false);
const toast = useToast();
const filteredNotifications = computed(() => {
  const rows = activeTab.value === 0 ? notifications.value.filter(notification => !notification.read) : notifications.value;
  return rows.map(notification => ({ ...notification, action: getAction(notification) }));
});

const markAll = async () => {
  if (markingAll.value) return;
  markingAll.value = true;
  try {
    if (!await markAllAsRead()) toast.add({ title: 'Couldn’t mark notifications as read', description: 'Please try again.', color: 'red' });
  } finally { markingAll.value = false; }
};
</script>

<template>
  <UDashboardPage><UDashboardPanel grow>
    <ErpPageNavbar title="Notifications" />
  <div class="mx-auto max-w-3xl p-4">
    <CompanyFormField toolbar />
    <div class="mb-6 flex flex-wrap items-center justify-between gap-4">
      <h1 class="text-2xl font-bold">Notifications</h1>
      <div class="flex flex-wrap items-center gap-2">
        <UButton label="Mark all as read" color="gray" variant="soft" :loading="markingAll" :disabled="unreadCount === 0" @click="markAll" />
        <UTabs v-model="activeTab" :items="[{ label: `Unread (${unreadCount})` }, { label: 'All' }]" />
      </div>
    </div>

    <UAlert v-if="error" color="red" title="Couldn’t load notifications" description="Try again or check your connection." class="mb-4">
      <template #actions><UButton color="red" variant="soft" :loading="isLoading" @click="fetchNotifications">Retry</UButton></template>
    </UAlert>
    <div v-if="isLoading" role="status" aria-label="Loading notifications" class="flex justify-center py-8">
      <UIcon name="i-heroicons-arrow-path" class="h-6 w-6 animate-spin" />
    </div>
    <div v-else class="space-y-3">
      <div v-for="notification in filteredNotifications" :key="notification.id" class="rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-900" :class="{ 'opacity-70': notification.read }">
        <div class="flex gap-3">
          <div class="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-white" :class="typeConfigs[notification.type]?.color || 'bg-gray-500'">
            <UIcon :name="typeConfigs[notification.type]?.icon || 'i-heroicons-bell'" class="h-5 w-5" />
          </div>
          <div class="min-w-0 flex-1">
            <div class="flex flex-wrap items-start justify-between gap-2">
              <h3 class="font-medium">{{ notification.title }}</h3>
              <p class="text-xs text-gray-500 dark:text-gray-400">{{ formatRelativeTime(notification.createdAt.toISOString()) }}</p>
            </div>
            <p class="mt-1 text-sm text-gray-600 dark:text-gray-300">{{ notification.message }}</p>
            <div v-if="notification.action" class="mt-3">
              <UButton :to="notification.action.route" :label="notification.action.label" size="xs" color="primary" variant="soft" />
            </div>
          </div>
        </div>
      </div>
      <div v-if="filteredNotifications.length === 0" class="py-12 text-center text-gray-500 dark:text-gray-400">
        <p>No notifications found</p>
        <p class="mt-1 text-sm">{{ activeTab === 0 ? "You're all caught up!" : "You haven't received any notifications yet" }}</p>
      </div>
    </div>
  </div>
  </UDashboardPanel></UDashboardPage>
</template>
