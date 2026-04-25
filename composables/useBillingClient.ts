/**
 * useBillingClient
 *
 * Manages client lookup, match suggestions, client-add flow, and points redemption for billing.
 */
export function useBillingClient(
  phoneNo: ReturnType<typeof ref>,
  clientId: ReturnType<typeof ref>,
  clientName: ReturnType<typeof ref>,
  points: ReturnType<typeof ref>,
  redeemedAmt: ReturnType<typeof ref>,
  redeemedPoints: ReturnType<typeof ref>,
  isRedeemPoint: ReturnType<typeof ref>,
  grandTotal: ReturnType<typeof computed>,
  isClientAddModelOpen: ReturnType<typeof ref>,
  onClientFound: () => void
) {
  const useAuth = () => useNuxtApp().$auth
  const redeeming = ref(false)
  const isClientLoading = ref(false)
  const companyClients = ref<any[]>([])
  const isApplyingSelection = ref(false)
  const selectedClientPhone = ref('')
  const selectedClientName = ref('')
  const searchTerm = computed(() => String(phoneNo.value || '').trim())
  const normalizedDigits = computed(() => searchTerm.value.replace(/\D/g, ''))
  let currentSearchRequestId = 0

  const fetchClientMatches = async (term: string) => {
    const trimmedTerm = String(term || '').trim()
    if (!trimmedTerm || !useAuth().session.value?.companyId) {
      companyClients.value = []
      return
    }

    const requestId = ++currentSearchRequestId
    isClientLoading.value = true

    try {
      const data = await $fetch('/api/bill/findManyClient', {
        query: { q: trimmedTerm },
      })

      if (requestId !== currentSearchRequestId) return
      companyClients.value = Array.isArray(data) ? data : []
    } catch (error) {
      if (requestId === currentSearchRequestId) {
        companyClients.value = []
      }
      console.error('Failed to fetch client matches:', error)
    } finally {
      if (requestId === currentSearchRequestId) {
        isClientLoading.value = false
      }
    }
  }

  const clientMatches = computed(() =>
    (companyClients.value || []).map((row: any) => {
      const rawPhone = String(row.phone || '')
      const digits = rawPhone.replace(/\D/g, '')

      return {
        id: row.id,
        name: row.name || '',
        phone: digits.slice(-10) || digits,
        displayPhone: rawPhone,
        points: Number(row.points || 0),
      }
    })
  )

  const applySelectedClient = (match: { id: string; name: string; phone: string; points: number }) => {
    isApplyingSelection.value = true
    clientName.value = match.name
    clientId.value = match.id
    phoneNo.value = match.phone
    points.value = match.points
    selectedClientPhone.value = String(match.phone || '').trim().toLowerCase()
    selectedClientName.value = String(match.name || '').trim().toLowerCase()
    onClientFound()
    nextTick(() => {
      isApplyingSelection.value = false
    })
  }

  const findExactClientMatch = () => {
    const lowerSearch = searchTerm.value.toLowerCase()
    const searchDigits = normalizedDigits.value

    return clientMatches.value.find((match) => {
      const lowerName = String(match.name || '').trim().toLowerCase()
      const matchDigits = String(match.phone || '').replace(/\D/g, '')
      return lowerName === lowerSearch || (searchDigits && matchDigits === searchDigits)
    }) || null
  }

  const handleEnterPhone = async () => {
    try {
      if (!searchTerm.value) return 'empty'
      if (isClientLoading.value) return 'loading'

      const exactMatch = findExactClientMatch()
      if (exactMatch) {
        applySelectedClient(exactMatch)
        return 'selected'
      }

      if (clientMatches.value.length === 1) {
        applySelectedClient(clientMatches.value[0])
        return 'selected'
      }

      if (clientMatches.value.length === 0) {
        isClientAddModelOpen.value = true
        return 'create'
      }

      return 'ambiguous'
    } catch (err) {
      console.error('Failed to fetch client:', err)
      return 'error'
    }
  }

  const handleClientAdded = (id: string, name: string, phone?: string) => {
    isApplyingSelection.value = true
    clientName.value = name
    clientId.value = id
    if (phone) {
      phoneNo.value = String(phone).replace(/\D/g, '').slice(-10)
    }
    points.value = 0
    selectedClientPhone.value = String(phoneNo.value || '').trim().toLowerCase()
    selectedClientName.value = String(name || '').trim().toLowerCase()
    isClientAddModelOpen.value = false
    nextTick(() => {
      isApplyingSelection.value = false
    })
  }

  watch(searchTerm, (value) => {
    if (isApplyingSelection.value) return

    const normalizedValue = String(value || '').trim().toLowerCase()
    const matchesSelectedClient =
      normalizedValue &&
      (normalizedValue === selectedClientPhone.value || normalizedValue === selectedClientName.value)

    if (!normalizedValue || (!matchesSelectedClient && clientId.value)) {
      clientId.value = ''
      clientName.value = ''
      points.value = 0
      selectedClientPhone.value = ''
      selectedClientName.value = ''
    }
  })

  watch(searchTerm, (value) => {
    if (isApplyingSelection.value) return
    fetchClientMatches(value)
  }, { immediate: true })

  const handleRedeemPoints = async () => {
    redeeming.value = true

    try {
      if (!clientId.value) return

      if (!isRedeemPoint.value) {
        const redeemablePoints = Math.min(points.value, grandTotal.value)
        if (redeemablePoints <= 0) return

        redeemedPoints.value = redeemablePoints
        redeemedAmt.value += redeemablePoints
        points.value = Math.max(0, points.value - redeemablePoints)
        isRedeemPoint.value = true
      } else {
        if (redeemedPoints.value <= 0) return

        redeemedAmt.value -= redeemedPoints.value
        points.value = Math.max(0, points.value + redeemedPoints.value)
        redeemedPoints.value = 0
        isRedeemPoint.value = false
      }
    } catch (error) {
      console.error('Error updating client points', error)
    } finally {
      redeeming.value = false
    }
  }

  return {
    isClientLoading,
    clientMatches,
    redeeming,
    applySelectedClient,
    handleEnterPhone,
    handleClientAdded,
    handleRedeemPoints,
  }
}
