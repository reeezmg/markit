<!-- 
<script setup >
import { ref } from 'vue'
import { useNotifications } from '~/composables/useNotifications'
const { isNotificationsSlideoverOpen } = useDashboard()


const {
  notifications,
  unreadCount,
  typeConfigs,
  getAction,
  markAsRead
} = useNotifications()

const isOpen = ref(false)

const handleNotificationClick = async (notification) => {
  await markAsRead(notification.id)
  if (notification.actionPath) {
    navigateTo(notification.actionPath)
  }
  isOpen.value = false
}

const handleViewAll = () => {
  isOpen.value = false
  isNotificationsSlideoverOpen.value = true
}

</script>

<template>
  <div class="relative">
 
    <button
      @click="isOpen = !isOpen"
      class="p-2 rounded-full relative hover:bg-gray-100 dark:hover:bg-gray-700"
    >
    <UIcon name="i-heroicons-bell" class="w-5 h-5" />

      <span
        v-if="unreadCount > 0"
        class="absolute top-0 right-0 inline-flex items-center justify-center px-1.5 py-1 text-xs font-bold leading-none text-white transform translate-x-1/2 -translate-y-1/2 bg-red-500 rounded-full"
      >
        {{ unreadCount > 9 ? '9+' : unreadCount }}
      </span>
    </button>


    <div
      v-if="isOpen"
      class="absolute right-0 mt-2 w-80 bg-white dark:bg-gray-800 rounded-lg shadow-xl z-50 border border-gray-200 dark:border-gray-700"
      @click.stop
    >
      <div class="p-3 border-b border-gray-200 dark:border-gray-700 flex justify-between items-center">
        <h3 class="font-semibold">Notifications</h3>
        <button
          @click="notifications.forEach(n => !n.read && markAsRead(n.id))"
          class="text-sm text-blue-500 hover:text-blue-700"
          :disabled="unreadCount === 0"
        >
          Mark all as read
        </button>
      </div>

      <div class="divide-y divide-gray-200 dark:divide-gray-700 max-h-96 overflow-y-auto">
        <div
          v-for="notification in notifications"
          :key="notification.id"
          @click="handleNotificationClick(notification)"
          class="p-3 hover:bg-gray-50 dark:hover:bg-gray-700 cursor-pointer flex items-start gap-3"
          :class="{ 'bg-gray-50 dark:bg-gray-700/50': !notification.read }"
        >
          <div
            class="flex-shrink-0 rounded-full w-10 h-10 flex items-center justify-center text-white"
            :class="typeConfigs[notification.type]?.color || 'bg-gray-500'"
          >
            <div :class="typeConfigs[notification.type]?.icon || 'i-heroicons-bell'" class="w-5 h-5" />
          </div>

          <div class="flex-1 min-w-0">
            <h4 class="font-medium truncate">{{ notification.title }}</h4>
            <p class="text-sm text-gray-500 dark:text-gray-400 truncate">{{ notification.message }}</p>
            <p class="text-xs text-gray-400 dark:text-gray-500 mt-1">
              {{ formatRelativeTime(notification.createdAt) }}
            </p>

            <button
              v-if="getAction(notification)"
              @click.stop="navigateTo(getAction(notification)?.route)"
              class="mt-2 text-xs px-2 py-1 rounded"
              :class="[
                `text-${getAction(notification)?.color}-600`,
                `bg-${getAction(notification)?.color}-100`,
                `hover:bg-${getAction(notification)?.color}-200`
              ]"
            >
              {{ getAction(notification)?.label }}
            </button>
          </div>
        </div>

        <div
          v-if="notifications.length === 0"
          class="p-4 text-center text-gray-500 dark:text-gray-400"
        >
          No notifications yet
        </div>
      </div>

      <div class="p-3 border-t border-gray-200 dark:border-gray-700 text-center">
        <button
  class="text-sm text-blue-500 hover:text-blue-700"
  @click="handleViewAll"
>
  View all notifications
</button>

      </div>
    </div>
  </div>
</template> -->


<script setup>
import { ref } from 'vue'
import { useNotifications } from '~/composables/useNotifications'
const { isNotificationsSlideoverOpen } = useDashboard()

const {
  notifications,
  unreadCount,
  typeConfigs,
  getAction,
  markAsRead,
  fetchNotifications // Make sure this is exposed from your composable
} = useNotifications()

const isOpen = ref(false)

// Safe type config fallback
const getNotificationConfig = (type) => {
  return typeConfigs[type] || { 
    icon: 'i-heroicons-bell', 
    color: 'bg-gray-500' 
  }
}

// Modified click handler
const handleNotificationClick = async (notification) => {
  try {
    // Only mark as read if unread
    if (!notification.read) {
      await markAsRead(notification.id)
      // Optional: Update local state immediately
      notification.read = true
      // Or refresh the list:
      // await fetchNotifications()
    }
    
    if (notification.actionPath) {
      navigateTo(notification.actionPath)
    }
    isOpen.value = false
  } catch (error) {
    console.error('Failed to mark notification as read:', error)
  }
}

const handleViewAll = () => {
  isOpen.value = false
  isNotificationsSlideoverOpen.value = true
}
</script>

<template>
  <div class="relative">
    <!-- Bell Button (unchanged) -->
    <button
      @click="isOpen = !isOpen"
      class="p-2 rounded-full relative hover:bg-gray-100 dark:hover:bg-gray-700"
    >
      <UIcon name="i-heroicons-bell" class="w-5 h-5" />
      <span
        v-if="unreadCount > 0"
        class="absolute top-0 right-0 inline-flex items-center justify-center px-1.5 py-1 text-xs font-bold leading-none text-white transform translate-x-1/2 -translate-y-1/2 bg-red-500 rounded-full"
      >
        {{ unreadCount > 9 ? '9+' : unreadCount }}
      </span>
    </button>

    <!-- Dropdown -->
    <div
      v-if="isOpen"
      class="absolute right-0 mt-2 w-80 bg-white dark:bg-gray-800 rounded-lg shadow-xl z-50 border border-gray-200 dark:border-gray-700"
      @click.stop
    >
      <!-- Header (unchanged) -->
      <div class="p-3 border-b border-gray-200 dark:border-gray-700 flex justify-between items-center">
        <h3 class="font-semibold">Notifications</h3>
        <button
          @click="notifications.forEach(n => !n.read && markAsRead(n.id))"
          class="text-sm text-blue-500 hover:text-blue-700"
          :disabled="unreadCount === 0"
        >
          Mark all as read
        </button>
      </div>

      <!-- Notification List -->
      <div class="divide-y divide-gray-200 dark:divide-gray-700 max-h-96 overflow-y-auto">
        <div
          v-for="notification in notifications"
          :key="notification.id"
          @click="handleNotificationClick(notification)"
          class="p-3 hover:bg-gray-50 dark:hover:bg-gray-700 cursor-pointer flex items-start gap-3"
          :class="{ 'bg-gray-50 dark:bg-gray-700/50': !notification.read }"
        >
          <!-- Notification Icon -->
          <div
            class="flex-shrink-0 rounded-full w-10 h-10 flex items-center justify-center text-white"
            :class="getNotificationConfig(notification.type).color"
          >
            <UIcon :name="getNotificationConfig(notification.type).icon" class="w-5 h-5" />
          </div>

          <!-- Notification Content -->
          <div class="flex-1 min-w-0">
            <h4 class="font-medium truncate">{{ notification.title }}</h4>
            <p class="text-sm text-gray-500 dark:text-gray-400 truncate">{{ notification.message }}</p>
            <p class="text-xs text-gray-400 dark:text-gray-500 mt-1">
              {{ formatRelativeTime(notification.createdAt) }}
            </p>

            <!-- Action Button -->
            <button
              v-if="getAction(notification)"
              @click.stop="navigateTo(getAction(notification)?.route)"
              class="mt-2 text-xs px-2 py-1 rounded"
              :class="[
                `text-${getAction(notification)?.color}-600`,
                `bg-${getAction(notification)?.color}-100`,
                `hover:bg-${getAction(notification)?.color}-200`
              ]"
            >
              {{ getAction(notification)?.label }}
            </button>
          </div>

          <!-- Unread Indicator -->
          <div v-if="!notification.read" class="flex-shrink-0">
            <span class="w-2 h-2 rounded-full bg-blue-500 block mt-1.5"></span>
          </div>
        </div>

        <div
          v-if="notifications.length === 0"
          class="p-4 text-center text-gray-500 dark:text-gray-400"
        >
          No notifications yet
        </div>
      </div>

      <!-- Footer -->
      <div class="p-3 border-t border-gray-200 dark:border-gray-700 text-center">
        <button
          class="text-sm text-blue-500 hover:text-blue-700"
          @click="handleViewAll"
        >
          View all notifications
        </button>
      </div>
    </div>
  </div>
</template>