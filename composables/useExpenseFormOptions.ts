/**
 * Shared expense-form data: category + company-user options backed by the raw
 * pg endpoints under /api/accounts. Used by both the inline quick-add bar
 * (ExpenseQuickAdd) and the edit modal (ExpenseForm) so category create/delete
 * behaviour stays identical in both places.
 */
export function useExpenseFormOptions() {
  const useAuth = () => useNuxtApp().$auth
  const toast = useToast()

  const categories = ref<any[]>([])
  const companyUsers = ref<any[]>([])
  const categoriesLoading = ref(false)

  const loadCategories = async () => {
    if (!useAuth().session.value?.companyId) return
    categoriesLoading.value = true
    try {
      categories.value = await $fetch<any[]>('/api/accounts/expense-categories')
    } finally {
      categoriesLoading.value = false
    }
  }

  const loadCompanyUsers = async (activeOnly = false) => {
    if (!useAuth().session.value?.companyId) return
    companyUsers.value = await $fetch<any[]>('/api/accounts/company-users', {
      query: activeOnly ? { activeOnly: 1 } : {},
    })
  }

  const createCategory = async (name: string) => {
    const newCategory = await $fetch<any>('/api/accounts/expense-categories', {
      method: 'POST',
      body: { name },
    })
    await loadCategories()
    return newCategory
  }

  const deleteCategory = async (id: string) => {
    try {
      await $fetch(`/api/accounts/expense-categories/${id}`, { method: 'DELETE' })
      await loadCategories()
      return true
    } catch (error: any) {
      if (error?.statusCode === 409 || error?.response?.status === 409) {
        toast.add({
          title: 'Cannot delete category',
          description: 'This category is used in one or more expenses.',
          color: 'red',
        })
      } else {
        toast.add({
          title: 'Error',
          description: 'Failed to delete category. Please try again.',
          color: 'red',
        })
      }
      return false
    }
  }

  return {
    categories,
    companyUsers,
    categoriesLoading,
    loadCategories,
    loadCompanyUsers,
    createCategory,
    deleteCategory,
  }
}
