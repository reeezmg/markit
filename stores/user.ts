import { defineStore } from 'pinia'
type ProcessedUser = {
  id: string
  email: string
  shortCut?: string
  name?: string
  image?: string | null
}

export const useUserStore = defineStore('user', () => {
  const users = ref<ProcessedUser[]>([])
  const loading = ref(false)
  const error = ref<any>(null)

  async function fetchUsers() {
    loading.value = true
    error.value = null
    try {
      const data = await $fetch<ProcessedUser[]>('/api/getuser')
      users.value = data
    } catch (err) {
      error.value = err
    } finally {
      loading.value = false
    }
  }

  async function fetchAllUsers() {
    if (users.value.length === 0) await fetchUsers()
  }

  async function refreshUsers() {
    await fetchUsers()
  }

  function getuserById(id: string) {
    return users.value.find((u) => u.id === id) || null
  }

  function getuserByShortCut(shortCut: string) {
    return users.value.find((u) => u.shortCut === shortCut) || null
  }

  return {
    users,
    loading,
    error,
    fetchAllUsers,
    refreshUsers,
    getuserById,
    getuserByShortCut,
  }
})
