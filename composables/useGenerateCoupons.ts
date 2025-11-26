import { useFetch } from '#app'

export function useGenerateCoupons() {
  const generatableCoupons = ref<any[]>([])
  const loading = ref(false)
  const error = ref<Error | null>(null)

  const generateCoupons = async (clientId: string, grandTotal: number) => {
    loading.value = true
    error.value = null
    try {
      const { data } = await useFetch('/api/coupons/generate', {
        method: 'POST',
        body: { clientId, grandTotal }
      })

      generatableCoupons.value = data.value?.generatableCoupons || []
      return generatableCoupons.value
    } catch (err: any) {
      error.value = err
      return []
    } finally {
      loading.value = false
    }
  }

  return {
    generatableCoupons,
    loading,
    error,
    generateCoupons
  }
}
