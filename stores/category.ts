// stores/category.ts
import { defineStore } from 'pinia'

export const useCategoryStore = defineStore('category', () => {
  const categories = ref<any[]>([])
  const loading = ref(false)
  const error = ref<any>(null)

  // ✅ Fetch all categories (used internally)
  async function fetchCategories() {
    loading.value = true
    error.value = null
    try {
      const data = await $fetch('/api/gettax')
      categories.value = data
    } catch (err) {
      error.value = err
    } finally {
      loading.value = false
    }
  }

  // ✅ Initial fetch (prevents duplicate fetch if already loaded)
  async function fetchAllCategories() {
    if (categories.value.length === 0) {
      await fetchCategories()
    }
  }

  // ✅ Refresh (force re-fetch categories from server)
  async function refreshCategories() {
    await fetchCategories()
  }

  // ✅ Get category by ID
  function getCategoryById(id: string) {
    return categories.value.find((c) => c.id === id) || null
  }

  return {
    categories,
    loading,
    error,
    fetchAllCategories,
    refreshCategories,
    getCategoryById,
  }
})
