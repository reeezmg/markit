

// composables/useNotifications.ts
import { ref, computed, onMounted, onUnmounted } from 'vue'
import type { Notification, NotificationType } from '~/types/notification'

export const useNotifications = () => {
  const notifications = ref<Notification[]>([])
  const unreadCount = computed(() => notifications.value.filter(n => !n.read).length)
  const isLoading = ref(false)
  const isConnected = ref(false)
  const error = ref<Error | null>(null)
  let ws: WebSocket | null = null
  let reconnectAttempt = 0
  const maxReconnectAttempts = 5

  const auth = useNuxtApp().$auth
  const companyId = auth?.session.value?.companyId

  const typeConfigs = {
    BILL_CREATED: { icon: 'i-heroicons-shopping-bag', color: 'bg-blue-500' },
    EXPENSE_CREATED: { icon: 'i-heroicons-receipt-refund', color: 'bg-yellow-500' },
    PAYMENT_RECEIVED: { icon: 'i-heroicons-currency-dollar', color: 'bg-green-500' },
    INVENTORY_LOW: { icon: 'i-heroicons-exclamation-triangle', color: 'bg-orange-500' },
    SHIPMENT_SENT: { icon: 'i-heroicons-truck', color: 'bg-purple-500' },
    SYSTEM_ALERT: { icon: 'i-heroicons-shield-exclamation', color: 'bg-red-500' }
  }

  const getAction = (notification: Notification) => {
    if (!notification.actionPath) return null
    
    const actions: Partial<Record<NotificationType, { label: string; color: string }>> = {
      ORDER_RECEIVED: { label: 'View Bill', color: 'blue' },
      EXPENSE_CREATED: { label: 'Review Expense', color: 'yellow' },
      PAYMENT_RECEIVED: { label: 'View Payment', color: 'green' }
    }
    
    const config = actions[notification.type]
    return config ? { ...config, route: notification.actionPath } : null
  }

  const fetchNotifications = async () => {
    try {
      isLoading.value = true
      const data = await $fetch<Notification[]>(`/api/notifications?companyId=${companyId}`)
      notifications.value = data.sort((a, b) => 
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      )
    } catch (err) {
      error.value = err as Error
      console.error('Failed to fetch notifications:', err)
    } finally {
      isLoading.value = false
    }
  }

  const markAsRead = async (id: string) => {
    try {
      await $fetch(`/api/notifications/${id}/read`, { method: 'PATCH' })
      notifications.value = notifications.value.map(n => 
        n.id === id ? { ...n, read: true } : n
      )
    } catch (err) {
      console.error('Failed to mark notification as read:', err)
    }
  }

  const markAllAsRead = async () => {
    try {
      await $fetch(`/api/notifications/read-all?companyId=${companyId}`, { 
        method: 'PATCH' 
      })
      notifications.value = notifications.value.map(n => ({ ...n, read: true }))
    } catch (err) {
      console.error('Failed to mark all notifications as read:', err)
    }
  }

  const playNotificationSound = () => {
    const audio = new Audio('/sounds/notification.mp3')
    audio.volume = 0.3
    audio.play().catch(e => console.warn('Audio playback failed:', e))
  }

  const setupWebSocket = () => {
    if (!companyId || ws) return
    
    console.log(`Connecting WebSocket for company ${companyId}`)
   // Use wss:// if in production
  const protocol = window.location.protocol === 'https:' ? 'wss://' : 'ws://';
  const url = `${protocol}${window.location.hostname}:3003?companyId=${companyId}`;
  
  ws = new WebSocket(url);

    ws.onopen = () => {
      isConnected.value = true
      reconnectAttempt = 0
      console.log('WebSocket connected')
    }

    ws.onmessage = (event) => {
      try {
        const notification = JSON.parse(event.data) as Notification
        notifications.value = [notification, ...notifications.value]
        if (!notification.read) playNotificationSound()
      } catch (err) {
        console.error('Failed to parse WebSocket message:', err)
      }
    }

    ws.onclose = () => {
      isConnected.value = false
      if (reconnectAttempt < maxReconnectAttempts) {
        const delay = Math.min(1000 * reconnectAttempt, 5000)
        console.log(`Reconnecting in ${delay}ms...`)
        setTimeout(setupWebSocket, delay)
        reconnectAttempt++
      } else {
        console.error('Max reconnection attempts reached')
      }
    }

    ws.onerror = (err) => {
      console.error('WebSocket error:', err)
    }
  }

  onMounted(() => {
    fetchNotifications()
    setupWebSocket()
  })

  onUnmounted(() => {
    if (ws) {
      ws.close()
      ws = null
    }
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
    markAllAsRead
  }
}


// composables/useNotifications.ts
// import { ref, computed, onMounted, onUnmounted } from 'vue'
// import type { Notification } from '@prisma/client'

// export const useNotifications = () => {
//   const notifications = ref<Notification[]>([])
//   const unreadCount = computed(() => notifications.value.filter(n => !n.read).length)
//   const isConnected = ref(false)
//   let socket: WebSocket | null = null

//   const typeConfigs = {
//     BILL_CREATED: { 
//       icon: 'i-heroicons-shopping-bag', 
//       color: 'bg-blue-500' 
//     },
//     EXPENSE_CREATED: { 
//       icon: 'i-heroicons-receipt-refund', 
//       color: 'bg-yellow-500' 
//     },
//     ORDER_RECEIVED: { // Add this if your notifications use this type
//       icon: 'i-heroicons-shopping-cart',
//       color: 'bg-green-500'
//     },
//     // Add other notification types your system uses
//     DEFAULT: {
//       icon: 'i-heroicons-bell',
//       color: 'bg-gray-500'
//     }
//   }

//   const getAction = (notification: Notification) => {
//     const actions = {
//       BILL_CREATED: { label: 'View Bill', color: 'blue' },
//       EXPENSE_CREATED: { label: 'Review Expense', color: 'yellow' },
//       ORDER_RECEIVED: { label: 'View Order', color: 'green' }
//     }
//     return notification.actionPath ? {
//       ...actions[notification.type as keyof typeof actions],
//       route: notification.actionPath
//     } : null
//   }


//   const connect = (companyId: string) => {
//     if (socket) return

//     const protocol = window.location.protocol === 'https:' ? 'wss://' : 'ws://'
//     socket = new WebSocket(`${protocol}${window.location.hostname}:3003?companyId=${companyId}`)

//     socket.onopen = () => {
//       isConnected.value = true
//       console.log('WebSocket connected')
//     }

//     socket.onmessage = (event) => {
//       const notification = JSON.parse(event.data) as Notification
//       notifications.value = [notification, ...notifications.value]
//     }

//     socket.onclose = () => {
//       isConnected.value = false
//       socket = null
//       setTimeout(() => connect(companyId), 3000) // Reconnect after 3s
//     }
//   }

//   const fetchNotifications = async (companyId: string) => {
//     return await $fetch<Notification[]>(`/api/notifications?companyId=${companyId}`)
//   }

//   const markAsRead = async (id: string) => {
//     await $fetch(`/api/notifications/${id}/read`, { method: 'PATCH' })
//     notifications.value = notifications.value.map(n => 
//       n.id === id ? { ...n, read: true } : n
//     )
//   }

//   onMounted(async () => {
//     const companyId = useNuxtApp().$auth.session.value?.companyId
//     if (companyId) {
//       notifications.value = await fetchNotifications(companyId)
//       connect(companyId)
//     }
//   })

//   onUnmounted(() => {
//     socket?.close()
//   })

//   return {
//     typeConfigs,
//     notifications,
//     unreadCount,
//     isConnected,
//     markAsRead
//   }
// }