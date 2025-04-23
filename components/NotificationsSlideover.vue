<script setup lang="ts">
import { formatRelativeTime } from '~/utils/dates' // or your own helper
import { useNotifications } from '~/composables/useNotifications'
const { isNotificationsSlideoverOpen } = useDashboard()
const { notifications, typeConfigs, getAction, markAsRead } = useNotifications()
import type { Notification } from '~/types/notification'


const handleClick = async (notification: Notification) => {
  await markAsRead(notification.id)
  if (notification.actionPath) {
    navigateTo(notification.actionPath)
    isNotificationsSlideoverOpen.value = false
  }
}
</script>

<template>
  <UDashboardSlideover
    v-model="isNotificationsSlideoverOpen"
    title="Notifications"
  >
    <div class="p-4 space-y-3">
      <div 
        v-for="notification in notifications" 
        :key="notification.id"
        class="flex items-start gap-3 p-3 rounded-md hover:bg-gray-100 dark:hover:bg-gray-800/50 cursor-pointer"
        @click="handleClick(notification)"
      >
        <div 
          class="flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center text-white"
          :class="typeConfigs[notification.type]?.color || 'bg-gray-500'"
        >
          <div 
            :class="typeConfigs[notification.type]?.icon || 'i-heroicons-bell'" 
            class="w-5 h-5" 
          />
        </div>

        <div class="flex-1">
          <div class="flex justify-between text-sm">
            <span class="font-medium text-gray-900 dark:text-white">{{ notification.title }}</span>
            <span class="text-gray-500 text-xs dark:text-gray-400">{{ formatRelativeTime(notification.createdAt)}}</span>
          </div>
          <p class="text-gray-600 text-sm dark:text-gray-300">{{ notification.message }}</p>
        </div>
      </div>

      <div v-if="notifications.length === 0" class="text-center text-gray-500 dark:text-gray-400 py-12">
        No notifications found
      </div>
    </div>
  </UDashboardSlideover>
</template>
