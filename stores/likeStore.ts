import { defineStore } from 'pinia'
import type { LikedProduct } from '~/types'

export const useLikeStore = defineStore('like', () => {
  const liked = ref<LikedProduct[]>([])
  const companyId = ref('')
  const sessionId = ref('')
  const lastSynced = ref(0)
  const isLoading = ref(false)

  const likedCount = computed(() => liked.value.length)
  const likedItems = computed(() => liked.value)
  const isSynced = computed(() => !!lastSynced.value && (Date.now() - lastSynced.value) < 300000)
  const isLiked = (product: LikedProduct) =>
    liked.value.some((item) => item.variantId === product.variantId)

  async function toggleLike(product: LikedProduct, newCompanyId: string, newSessionId?: string) {
    if (!newCompanyId) throw new Error('Company ID is required')

    if (companyId.value && companyId.value !== newCompanyId) {
      liked.value = []
    }

    companyId.value = newCompanyId
    if (!sessionId.value && newSessionId) {
      sessionId.value = newSessionId
    }

    const existingIndex = liked.value.findIndex((i) => i.variantId === product.variantId)
    if (existingIndex >= 0) {
      liked.value.splice(existingIndex, 1)
    } else {
      liked.value.push({ variantId: product.variantId })
    }

    if (sessionId.value) {
      await _syncWithServer()
    }    

    return existingIndex < 0
  }

  async function removeLike(product: LikedProduct) {
    liked.value = liked.value.filter((i) => i.variantId !== product.variantId)
    if (sessionId.value) {
      await _syncWithServer()
    }
  }

  async function clearLikes() {
    liked.value = []
    companyId.value = ''
    sessionId.value = ''
    lastSynced.value = 0
    if (sessionId.value) {
      await _syncWithServer()
    }
  }

  async function fetchLikes(newCompanyId: string, newSessionId: string) {
    if (!newCompanyId || !newSessionId) return

    companyId.value = newCompanyId
    sessionId.value = newSessionId
    isLoading.value = true

    try {
      const { items } = await $fetch<{ items: LikedProduct[] }>('/api/like/get', {
        query: {
          companyId: newCompanyId,
          clientId: newSessionId,
          includeVariant: 'true'
        }
      })
      if (items) {
        liked.value = items
        lastSynced.value = Date.now()
      }
    } catch (error) {
      console.error('Failed to fetch likes:', error)
      throw error
    } finally {
      isLoading.value = false
    }
  }

  async function _syncWithServer() {
    if (!sessionId.value || !companyId.value || isLoading.value) return
    isLoading.value = true

    try {
      await $fetch('/api/like/update', {
        method: 'POST',
        body: {
          companyId: companyId.value,
          clientId: sessionId.value,
          items: liked.value
        }
      })
      lastSynced.value = Date.now()
    } catch (error) {
      console.error('Like sync failed:', error)
      throw error
    } finally {
      isLoading.value = false
    }
  }

  async function _mergeWithServerLikes(newSessionId: string, newCompanyId: string) {
    sessionId.value = newSessionId
    companyId.value = newCompanyId

    if (!sessionId.value || !companyId.value || isLoading.value) return
    isLoading.value = true

    try {
      const { items } = await $fetch<{ items: LikedProduct[] }>('/api/like/merge', {
        method: 'POST',
        body: {
          guestItems: liked.value,
          companyId: companyId.value,
          clientId: sessionId.value
        }
      })

      if (items) {
        liked.value = items
        lastSynced.value = Date.now()
      }
    } catch (error) {
      console.error('Like merge failed:', error)
      throw error
    } finally {
      isLoading.value = false
    }
  }

  return {
    liked,
    companyId,
    sessionId,
    lastSynced,
    isLoading,
    likedCount,
    likedItems,
    isSynced,
    isLiked,
    toggleLike,
    removeLike,
    clearLikes,
    fetchLikes,
    _mergeWithServerLikes
  }
}, {
  persist: {
    pick: ['liked', 'companyId', 'sessionId', 'lastSynced'],
  }
})
