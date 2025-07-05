import { defineStore } from 'pinia'
import type { CartItem } from '~/types'
import type { CartFetchResponse } from '~/types/cart'

export const useCartStore = defineStore('cart', () => {
  const items = ref<CartItem[]>([])
  const companyId = ref('')
  const sessionId = ref('')
  const lastSynced = ref(0)
  const isLoading = ref(false)

  const cartItemCount = computed(() =>
    items.value.reduce((count, item) => count + (item.qty || 1), 0)
  )

  const cartItems = computed(() => items.value)
  const cartCompanyId = computed(() => companyId.value)

  const isSynced = computed(() =>
    !!lastSynced.value && Date.now() - lastSynced.value < 300000 // 5 minutes
  )

  async function addToCart(item: CartItem, newCompanyId: string, newSessionId?: string) {
    if (!newCompanyId) throw new Error('Company ID is required')

    if (companyId.value && companyId.value !== newCompanyId) {
      items.value = []
    }

    companyId.value = newCompanyId

    if (!sessionId.value && newSessionId) {
      sessionId.value = newSessionId
    }

    const existingIndex = items.value.findIndex(
      (i) => i.variantId === item.variantId && i.size === item.size
    )

    if (existingIndex >= 0) {
      items.value[existingIndex].qty = (items.value[existingIndex].qty || 1) + (item.qty || 1)
    } else {
      items.value.push({ ...item, qty: item.qty || 1 })
    }

    if (sessionId.value) {
      await _syncWithServer()
    }
  }

  async function removeFromCart(item: CartItem) {
    items.value = items.value.filter(
      (i) => !(i.variantId === item.variantId && i.size === item.size)
    )
    if (sessionId.value) {
      await _syncWithServer()
    }
  }

  async function clearCart() {
    items.value = []
    companyId.value = ''
    sessionId.value = ''
    lastSynced.value = 0

    if (sessionId.value) {
      await _syncWithServer()
    }
  }

  async function fetchCart(newCompanyId: string, newSessionId: string) {
    if (!newCompanyId || !newSessionId) return

    companyId.value = newCompanyId
    sessionId.value = newSessionId
    isLoading.value = true

    try {
      const { items: fetchedItems } = await $fetch<CartFetchResponse>('/api/cart/get', {
        query: {
          companyId: newCompanyId,
          clientId: newSessionId,
          includeVariant: 'true'
        }
      })

      if (fetchedItems) {
        items.value = fetchedItems
        lastSynced.value = Date.now()
      }
    } catch (error) {
      console.error('Failed to fetch cart:', error)
      throw error
    } finally {
      isLoading.value = false
    }
  }

  async function _mergeWithServerCart(sessionIdVal: string, companyIdVal: string) {
    sessionId.value = sessionIdVal
    companyId.value = companyIdVal

    if (!sessionId.value || !companyId.value || isLoading.value) return
    isLoading.value = true

    try {
      const { items: mergedItems } = await $fetch<CartFetchResponse>('/api/cart/merge', {
        method: 'POST',
        body: {
          guestItems: items.value,
          companyId: companyId.value,
          clientId: sessionId.value
        }
      })

      if (mergedItems) {
        items.value = mergedItems
        lastSynced.value = Date.now()
      }
    } catch (error) {
      console.error('Cart merge failed:', error)
      throw error
    } finally {
      isLoading.value = false
    }
  }

  async function _syncWithServer() {
    if (!sessionId.value || !companyId.value || isLoading.value) return
    isLoading.value = true

    try {
      await $fetch('/api/cart/update', {
        method: 'POST',
        body: {
          companyId: companyId.value,
          clientId: sessionId.value,
          items: items.value
        }
      })

      lastSynced.value = Date.now()
    } catch (error) {
      console.error('Cart sync failed:', error)
      throw error
    } finally {
      isLoading.value = false
    }
  }

  return {
    items,
    companyId,
    sessionId,
    lastSynced,
    isLoading,
    cartItemCount,
    cartItems,
    cartCompanyId,
    isSynced,
    addToCart,
    removeFromCart,
    clearCart,
    fetchCart,
    _mergeWithServerCart
  }
}, {
  persist: {
    pick: ['items', 'companyId', 'sessionId', 'lastSynced'],
  }
})
