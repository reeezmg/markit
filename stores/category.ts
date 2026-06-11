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


  // ✅ Refresh (force re-fetch categories from server)
  async function refreshCategories() {
    await fetchCategories()
  }

  // ✅ Get category by ID
  function getCategoryById(id: string) {
    return categories.value.find((c) => c.id === id) || null
  }
  function getCategoryByShortCut(shortCut: string) {
    return categories.value.find((c) => c.shortCut === shortCut) || null
  }

  // Parse "catShortCut-subShortCut" or plain "catShortCut"
  // Returns { category, subcategory } where subcategory may be null
  function resolveShortCut(input: string): { category: any; subcategory: any } | null {
    const parts = input.split('-')
    const catShortCut = parts[0]
    const subShortCut = parts.length > 1 ? parts.slice(1).join('-') : null

    const category = categories.value.find((c) => c.shortCut === catShortCut) || null
    if (!category) return null

    const subcategory = subShortCut
      ? (category.subcategories || []).find((s: any) => s.shortCut === subShortCut) || null
      : null

    return { category, subcategory }
  }

  return {
    categories,
    loading,
    error,
    fetchCategories,
    refreshCategories,
    getCategoryById,
    getCategoryByShortCut,
    resolveShortCut,
  }
})
