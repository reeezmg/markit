
<script setup>
definePageMeta({
  middleware: 'auth'
})

const { 
  notifications, 
  unreadCount, 
  markAllAsRead,
  typeConfigs,
  getAction,
  isLoading
} = useNotifications()

const activeTab = ref<'all' | 'unread'>('unread')

const filteredNotifications = computed(() => {
  return activeTab.value === 'unread'
    ? notifications.value.filter(n => !n.read)
    : notifications.value
})

// onMounted(() => {
//   if (unreadCount.value > 0) {
//     markAllAsRead()
//   }
// })

watchEffect(() => {
  if (activeTab.value === 'unread' && unreadCount.value > 0) {
    markAllAsRead()
  }
})

</script>
<template>
  <div class="max-w-3xl mx-auto p-4">
    <div class="flex justify-between items-center mb-6">
      <h1 class="text-2xl font-bold">Notifications</h1>
      <div class="flex gap-2">
        <UTabs
          v-model="activeTab"
          :items="[
            { label: `Unread (${unreadCount})`, value: 'unread' },
            { label: 'All', value: 'all' }
          ]"
        />
      </div>
    </div>

    <div v-if="isLoading" class="flex justify-center py-8">
      <USpinner />
    </div>

    <div v-else class="space-y-2">
        <div v-for="notification in filteredNotifications" :key="notification.id" class="...">
  <div class="flex gap-3">
    <div
      class="..."
      :class="typeConfigs[notification.type]?.color || 'bg-gray-500'"
    >
      <div :class="typeConfigs[notification.type]?.icon || 'i-heroicons-bell'" class="w-5 h-5" />
    </div>

    <div class="flex-1">
      <div class="flex justify-between">
        <h3 class="font-medium">{{ notification.title }}</h3>
        <p class="text-xs text-gray-500 dark:text-gray-400">
          {{ formatRelativeTime(notification.createdAt) }}
        </p>
      </div>
      <p class="text-sm text-gray-600 dark:text-gray-300 mt-1">
        {{ notification.message }}
      </p>

      <div v-if="action = getAction(notification)" class="mt-3">
        <UButton
          :to="action.route"
          size="xs"
          :color="action.color || 'gray'"
          variant="soft"
        >
          {{ action.label }}
        </UButton>
      </div>
    </div>
  </div>
</div>


      <div 
        v-if="filteredNotifications.length === 0"
        class="text-center py-12 text-gray-500 dark:text-gray-400"
      >
        <p>No notifications found</p>
        <p class="text-sm mt-1">
          {{
            activeTab === 'unread'
              ? "You're all caught up!"
              : "You haven't received any notifications yet"
          }}
        </p>
      </div>
    </div>
  </div> 
</template> 