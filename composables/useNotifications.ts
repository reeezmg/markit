
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import { NOTIFICATION_TYPES, type AppNotification, type NotificationType ,type NotificationConfig } from '~/types/notification'

export const useNotifications = (scope?: ReturnType<typeof useCompanyScope>) => {
  const request = scope?.fetch || $fetch
  const notifications: Ref<AppNotification[]> = ref([])
  const unreadCount = computed(() => notifications.value.filter(n => !n.read).length)
  const isLoading = ref(false)
  const isConnected = ref(false)
  const error = ref<Error | null>(null)
  
  let refreshTimer: ReturnType<typeof setInterval> | undefined
  let mounted = false
  let requestId = 0
  let controller: AbortController | undefined
  let initialized = false
  const auth = scope?.auth || useNuxtApp().$auth
  const companyId = computed(() => auth?.session.value?.companyId)
  const senderId = computed(() => auth?.session.value?.id)

  // Add this to your composable
const typeConfigs: Record<NotificationType, NotificationConfig> = {
  ORDER_RECEIVED: { 
    icon: 'i-heroicons-shopping-bag', 
    color: 'bg-blue-500',
    label: 'New Order'
  },
  BILL_CREATED: { 
    icon: 'i-heroicons-document-text', 
    color: 'bg-purple-500',
    label: 'New Bill' 
  },
  PAYMENT_RECEIVED: { 
    icon: 'i-heroicons-currency-dollar', 
    color: 'bg-green-500',
    label: 'Payment Received'
  },
  EXPENSE_CREATED: { 
    icon: 'i-heroicons-receipt-refund', 
    color: 'bg-yellow-500',
    label: 'New Expense'
  },
  INVENTORY_LOW: { 
    icon: 'i-heroicons-exclamation-triangle', 
    color: 'bg-orange-500',
    label: 'Low Stock'
  },
  SHIPMENT_SENT: { 
    icon: 'i-heroicons-truck', 
    color: 'bg-indigo-500',
    label: 'Shipment Sent'
  },
  SYSTEM_ALERT: { 
    icon: 'i-heroicons-shield-exclamation', 
    color: 'bg-red-500',
    label: 'System Alert'
  }
}

  const validateNotification = (data: any): AppNotification => {
    return {
      id: data.id || '',
      companyId: data.companyId || companyId.value || '',
      userId: data.userId || undefined,
      clientId: data.clientId || undefined,
      type: NOTIFICATION_TYPES.includes(data.type) ? data.type : 'SYSTEM_ALERT',
      title: data.title || 'Notification',
      message: data.message || '',
      read: Boolean(data.read),
      actionPath: data.actionPath || undefined,
      metadata: data.metadata || undefined,
      createdAt: data.createdAt ? new Date(data.createdAt) : new Date()
    }
  }


  const getAction = (notification: AppNotification) => {
    if (!notification.actionPath) return null
    
    const actions: Partial<Record<NotificationType, { label: string; color: string }>> = {
      BILL_CREATED: { label: 'View Bill', color: 'blue' },
      ORDER_RECEIVED : { label: 'View Order', color: 'purple' },
      EXPENSE_CREATED: { label: 'Review Expense', color: 'yellow' },
      PAYMENT_RECEIVED: { label: 'View Payment', color: 'green' },
      INVENTORY_LOW: { label: 'Check Stock', color: 'orange' }
    }
    
    return actions[notification.type] 
      ? { ...actions[notification.type], route: notification.actionPath } 
      : null
  }

  const fetchNotifications = async () => {
    const selectedCompany = companyId.value
    if (!selectedCompany || !senderId.value) return
    const currentRequest = ++requestId
    controller?.abort()
    controller = new AbortController()
    try {
      isLoading.value = true
      const data = await request<any[]>('/api/notifications', {
        query: { companyId: selectedCompany, userId: senderId.value }, signal: controller.signal,
      })
      if (currentRequest !== requestId || selectedCompany !== companyId.value) return
      const previousIds = new Set(notifications.value.map(notification => notification.id))
      const next = Array.isArray(data)
        ? data.map(validateNotification)
            .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
        : []
      if (initialized && next.some(notification => !notification.read && !previousIds.has(notification.id))) playNotificationSound()
      notifications.value = next
      initialized = true
      error.value = null
      isConnected.value = true
    } catch (err) {
      if (currentRequest !== requestId || controller?.signal.aborted) return
      error.value = err as Error
      isConnected.value = false
    } finally {
      if (currentRequest === requestId) isLoading.value = false
    }
  }

  const markAsRead = async (id: string) => {
    try {
      await request(`/api/notifications/${id}/read`, { method: 'PATCH' })
      notifications.value = notifications.value.map(n => 
        n.id === id ? { ...n, read: true } : n
      )
    } catch (err) {
      console.error('Failed to mark notification as read:', err)
    }
  }

  const markAllAsRead = async () => {
    const selectedCompany = companyId.value
    const selectedSender = senderId.value
    if (!selectedCompany || !selectedSender) return false
    try {
      await request(`/api/notifications/read-all?companyId=${selectedCompany}`, { method: 'PATCH' })
      if (selectedCompany !== companyId.value || selectedSender !== senderId.value) return false
      notifications.value = notifications.value.map(notification => ({ ...notification, read: true }))
      return true
    } catch (err) {
      console.error('Failed to mark all notifications as read:', err)
      return false
    }
  }


  const playNotificationSound = () => {
    try {
      const audio = new Audio('/sounds/notification.mp3')
      audio.volume = 0.3
      audio.play().catch(e => console.warn('Audio playback failed:', e))
    } catch (e) {
      console.warn('Sound initialization failed:', e)
    }
  }

  const refreshWhenVisible = () => {
    if (document.visibilityState === 'visible' && !isLoading.value) void fetchNotifications()
  }

  watch([companyId, senderId], () => {
    ++requestId
    controller?.abort()
    notifications.value = []
    initialized = false
    isConnected.value = false
    isLoading.value = false
    error.value = null
    if (mounted) void fetchNotifications()
  })

  onMounted(() => {
    mounted = true
    void fetchNotifications()
    refreshTimer = setInterval(refreshWhenVisible, 30000)
    window.addEventListener('focus', refreshWhenVisible)
    document.addEventListener('visibilitychange', refreshWhenVisible)
  })

  onUnmounted(() => {
    mounted = false
    ++requestId
    controller?.abort()
    if (refreshTimer) clearInterval(refreshTimer)
    window.removeEventListener('focus', refreshWhenVisible)
    document.removeEventListener('visibilitychange', refreshWhenVisible)
  })

  return {
    notifications,
    unreadCount,
    isLoading,
    error,
    isConnected,
    typeConfigs,
    getAction,
    fetchNotifications,
    markAsRead,
    markAllAsRead,

  }
}
