/**
 * useBillingClient
 *
 * Manages client lookup, client-add flow, and points redemption for billing.
 *
 * @param phoneNo             Reactive phone number input ref (from useBillingDraft)
 * @param clientId            Reactive client ID ref (from useBillingDraft)
 * @param clientName          Reactive client name ref (from useBillingDraft)
 * @param points              Reactive client points ref (from useBillingDraft)
 * @param redeemedAmt         Reactive redeemed amount ref (from useBillingDraft)
 * @param redeemedPoints      Reactive redeemed points ref (from useBillingDraft)
 * @param isRedeemPoint       Reactive redeem toggle ref (from useBillingDraft)
 * @param grandTotal          Computed grand total (from useBillingDraft)
 * @param isClientAddModelOpen Ref controlling the add-client modal visibility
 * @param onClientFound       Callback to run after a client is found (e.g. focus discount input)
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
  const isClientLoading = ref(false)
  const redeeming = ref(false)

  // ─── Phone lookup ────────────────────────────────────────────────────────

  const fetchClientByPhone = async (phone: string) => {
    isClientLoading.value = true
    try {
      if (!phone) return null
      const data = await $fetch('/api/bill/findUniqueClient', {
        query: { phone: `+91${phone}` },
      })
      return data ?? null
    } catch (error) {
      console.error('Error fetching client by phone:', error)
      throw error
    } finally {
      isClientLoading.value = false
    }
  }

  const handleEnterPhone = async () => {
    try {
      const data = await fetchClientByPhone(phoneNo.value)
      if (!data) {
        isClientAddModelOpen.value = true
        return
      }
      clientName.value = data.name
      clientId.value = data.id
      points.value = data.companies?.[0]?.points ?? 0
      onClientFound()
    } catch (err) {
      console.error('Failed to fetch client:', err)
    }
  }

  const handleClientAdded = (id: string, name: string) => {
    clientName.value = name
    clientId.value = id
    points.value = 0
    isClientAddModelOpen.value = false
  }

  // ─── Points redemption ───────────────────────────────────────────────────

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
    redeeming,
    handleEnterPhone,
    handleClientAdded,
    handleRedeemPoints,
  }
}
