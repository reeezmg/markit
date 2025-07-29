
<script setup lang="ts">
import { ref, computed } from 'vue'
import { useNotifications } from '~/composables/useNotifications'
import { NOTIFICATION_TYPES, type NotificationFilter, type AppNotification, type NotificationType, type NotificationConfig } from '~/types/notification'

const { isNotificationsSlideoverOpen } = useDashboard()

// Destructure with proper typing
const {
  notifications,
  unreadCount,
  typeConfigs,
  getAction,
  markAsRead,
  markAllAsRead,
  isLoading,
  error,
  isConnected
} = useNotifications()

const allNotifications = toRef(notifications)

// State
const isOpen = ref(false)
const hoveredNotification = ref<string | null>(null)
const activeFilter = ref<NotificationFilter>('all')
const session = useAuth().session.value
const userRole = session?.role || 'user'
const notificationConfigs = computed(() => typeConfigs)
console.log(session?.role)
// Type-safe config fallback
const getNotificationConfig = (type: NotificationType): NotificationConfig => {
  return notificationConfigs.value[type] || {
    icon: 'i-heroicons-bell',
    color: 'bg-gray-500',
    label: 'Notification'
  }
}


// Type guard for filters
const isNotificationFilter = (value: string): value is NotificationFilter => {
  return value === 'all' || value === 'unread' || NOTIFICATION_TYPES.includes(value as NotificationType)
}

// Filter handler
const handleFilterClick = (filter: string) => {
  if (isNotificationFilter(filter)) {
    activeFilter.value = filter
  } else {
    console.warn(`Invalid filter type: ${filter}`)
  }
}

// Date formatting
const formatRelativeTime = (date: Date | string) => {
  const dateObj = new Date(date)
  if (isNaN(dateObj.getTime())) return 'Recently'
  
  const now = new Date()
  const diff = now.getTime() - dateObj.getTime()
  const minutes = Math.floor(diff / 60000)
  
  if (minutes < 1) return 'Just now'
  if (minutes < 60) return `${minutes}m ago`
  if (minutes < 1440) return `${Math.floor(minutes / 60)}h ago`
  return dateObj.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

const filteredNotifications = computed(() => {

  return allNotifications.value.filter(notification => {  
    // 1. First check if notification is valid
    if (!notification?.type) return false
    
    // 2. Apply role-based filtering (admin sees all, others filter BILL_CREATED)
    if (userRole !== 'admin' && notification.type === 'BILL_CREATED') {
      console.log("Filtering out BILL_CREATED for non-admin")
      return false
    }
    
    // 3. Apply active filter
    if (activeFilter.value === 'unread') {
      return !notification.read
    }
    if (activeFilter.value !== 'all') {
      return notification.type === activeFilter.value
    }
    
    return true
  })
})

// Available filters
const availableFilters = computed<NotificationFilter[]>(() => {
  const filters = new Set<NotificationFilter>(['all', 'unread'])
  const notifications = Array.isArray(allNotifications) ? allNotifications : []
  
  notifications.forEach(n => {
    if (userRole === 'admin' || n.type !== 'BILL_CREATED') {
      filters.add(n.type)
    }
  })
  
  return Array.from(filters)
})

// Notification click handler
const handleNotificationClick = async (notification: AppNotification) => {
  try {
    if (!notification.read) {
      await markAsRead(notification.id)
      notification.read = true
    }
    
    if (notification.actionPath) {
      // Use navigateTo from vue-router
      const router = useRouter()
      await router.push(notification.actionPath)
    }
    isOpen.value = false
  } catch (error) {
    console.error('Notification click error:', error)
  }
}

const handleViewAll = () => {
  isOpen.value = false
  isNotificationsSlideoverOpen.value = true
}
</script>

<template>
  <div>
    <UPopover>
    <UChip :text="unreadCount" color="red" size="2xl">
        <UIcon
            name="i-heroicons-bell"
            class="w-5 h-5"
        />
     </UChip>

     <template #panel>
    <div class="p-4 w-96">
  
      <!-- Header -->
      <div class="p-3 border-b border-gray-200 dark:border-gray-700 flex justify-between items-center">
        <div class="flex items-center gap-2">
          <h3 class="font-semibold">Notifications</h3>
          <span 
            v-if="!isConnected"
            class="w-2 h-2 rounded-full bg-red-500 animate-pulse"
            title="Disconnected"
          ></span>
        </div>
        <button
          @click="markAllAsRead"
          class="text-sm text-blue-500 hover:text-blue-700"
          :disabled="unreadCount === 0"
        >
          Mark all as read
        </button>
      </div>

      <!-- Filter Controls -->
      <div 
        v-if="availableFilters.length > 2" 
        class="p-2 border-b border-gray-200 dark:border-gray-700 flex overflow-x-auto gap-1"
      >
        <button
          v-for="filter in availableFilters"
          :key="filter"
          @click.stop="handleFilterClick(filter)"
          class="px-3 py-1 text-xs rounded-full whitespace-nowrap transition-colors"
          :class="{
            'bg-blue-500 text-white': activeFilter === filter,
            'bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600': activeFilter !== filter
          }"
        >
          {{ filter === 'all' ? 'All' : filter === 'unread' ? 'Unread' : getNotificationConfig(filter).label }}
        </button>
      </div>

      <!-- Notification List -->
      <div class="divide-y divide-gray-200 dark:divide-gray-700 max-h-96 overflow-y-auto">
        <template v-if="isLoading">
          <div class="p-4 text-center text-gray-500">
            Loading notifications...
          </div>
        </template>
        <template v-else-if="error">
          <div class="p-4 text-center text-red-500">
            Error loading notifications
          </div>
        </template>
        <template v-else>
          <div
            v-for="notification in filteredNotifications"
            :key="notification.id"
            @mouseenter="hoveredNotification = notification.id"
            @mouseleave="hoveredNotification = null"
            @click="handleNotificationClick(notification)"
            class="p-3 hover:bg-gray-50 dark:hover:bg-gray-700 cursor-pointer flex items-start gap-3 transition-colors"
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
              <p 
                class="text-sm text-gray-500 dark:text-gray-400"
                :class="{
                  'truncate': hoveredNotification !== notification.id,
                  'whitespace-normal break-words': hoveredNotification === notification.id
                }"
              >
                {{ notification.message }}
              </p>
              <p class="text-xs text-gray-400 dark:text-gray-500 mt-1">
                {{ formatRelativeTime(notification.createdAt) }}
              </p>

              <!-- Action Button -->
              <button
                v-if="getAction(notification)"
                @click.stop="handleNotificationClick(notification)"
                class="mt-2 text-xs px-2 py-1 rounded transition-colors"
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
            v-if="filteredNotifications.length === 0"
            class="p-4 text-center text-gray-500 dark:text-gray-400"
          >
            No notifications found
          </div>
        </template>
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
  </template>
</UPopover>
  </div>
</template>