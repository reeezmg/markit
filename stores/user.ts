import { defineStore } from 'pinia'

type ProcessedUser = {
  id: string
  email: string
  code?: string
  name?: string
  image?: string | null
}

export const useUserStore = defineStore('user', () => {
  const config = useRuntimeConfig();
  const users = ref<ProcessedUser[]>([])
  const loading = ref(false)
  const error = ref<any>(null)

  async function fetchUsers(companyId: string) {
    loading.value = true
    error.value = null
    try {
      const data = await $fetch<ProcessedUser[]>(config.public.prismaUrl + '/api/getuser', {
        query: { companyId }
      })
      users.value = data
    } catch (err) {
      error.value = err
    } finally {
      loading.value = false
    }
  }

  async function refreshUsers(companyId: string) {
    await fetchUsers(companyId)
  }

  function getuserById(id: string) {
    return users.value.find((u) => u.id === id) || null
  }

  function getuserByCode(code: string) {
    return users.value.find((u) => u.code === code) || null
  }

  return {
    users,
    loading,
    error,
    fetchUsers,
    refreshUsers,
    getuserById,
    getuserByCode,
  }
}, {
  persist: {
    pick: ['users'],
    key: 'users',
  }
})
