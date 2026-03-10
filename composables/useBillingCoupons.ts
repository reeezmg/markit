/**
 * useBillingCoupons
 *
 * Manages coupon fetching, eligibility filtering, discount calculation,
 * and reactive watchers that recalculate coupon value when items or client change.
 *
 * @param clientId    Reactive client ID ref (from useBillingDraft)
 * @param items       Reactive items array ref (from useBillingDraft)
 * @param grandTotal  Computed grand total (from useBillingDraft)
 * @param redeemedAmt Reactive redeemed amount ref (from useBillingDraft)
 * @param couponValue Reactive coupon value ref (from useBillingDraft)
 */
export function useBillingCoupons(
  clientId: ReturnType<typeof ref>,
  items: ReturnType<typeof ref>,
  grandTotal: ReturnType<typeof computed>,
  redeemedAmt: ReturnType<typeof ref>,
  couponValue: ReturnType<typeof ref>
) {
  const allCoupons = ref<any[]>([])
  const selectedCouponId = ref<any>(null)

  // ─── Coupon fetch ─────────────────────────────────────────────────────────

  const couponRefetch = async () => {
    try {
      const companyId = useNuxtApp().$auth.session.value?.companyId
      if (!companyId) return []

      const data = await $fetch('/api/bill/findManyCoupon', {
        method: 'GET',
        query: { companyId },
      })

      allCoupons.value = data ?? []
      return allCoupons.value
    } catch (error) {
      console.error('Error fetching coupons:', error)
      return []
    }
  }

  // ─── Eligibility check ────────────────────────────────────────────────────

  function isCouponEligible(coupon: any, orderValue: number, cId: string) {
    const now = new Date()
    const clientUsage = coupon.couponUsage.filter((u: any) => u.clientId === cId).length
    const clientAppearances = coupon.clients.filter((c: any) => c.clientId === cId).length

    if (!coupon.isActive) return false
    if (now < new Date(coupon.startDate) || now > new Date(coupon.endDate)) return false
    if (coupon.minOrderValue && orderValue < coupon.minOrderValue) return false
    if (coupon.usageLimit !== null && coupon.timesUsed >= coupon.usageLimit) return false
    if (coupon.perClientLimit !== null && clientUsage >= coupon.perClientLimit) return false

    if (coupon.audienceType === 'SPECIFIC') {
      if (!coupon.clients.some((c: any) => c.clientId === cId)) return false
    }

    if (coupon.audienceType === 'GENERATE') {
      if (clientUsage >= clientAppearances) return false
    }

    return true
  }

  // ─── Discount calculation ─────────────────────────────────────────────────

  function calculateDiscount(coupon: any, orderValue: number): number {
    if (!coupon) return 0
    if (coupon.type === 'GIFT') return 0

    let discount = 0

    if (coupon.type === 'PERCENTAGE') {
      discount = (orderValue * (coupon.discountValue ?? 0)) / 100
      if (coupon.maxDiscountAmount && discount > coupon.maxDiscountAmount) {
        discount = coupon.maxDiscountAmount
      }
    }

    if (coupon.type === 'FLAT') {
      discount = coupon.discountValue ?? 0
    }

    if (discount > orderValue) discount = orderValue

    return Math.round(discount)
  }

  // ─── Eligible coupons computed ────────────────────────────────────────────

  const eligibleCoupons = computed(() => {
    if (!clientId.value) return []
    return (allCoupons.value || [])
      .filter(coupon => isCouponEligible(coupon, grandTotal.value, clientId.value))
      .map(coupon => {
        const clientUsageCount = coupon.couponUsage.filter((u: any) => u.clientId === clientId.value).length
        let usageInfo = '∞'
        if (coupon.perClientLimit !== null) {
          const remaining = coupon.perClientLimit - clientUsageCount
          usageInfo = remaining > 0 ? `${remaining}` : '0'
        }
        return {
          label: `${coupon.code} (${coupon.type}) - ${usageInfo}`,
          value: coupon.id,
        }
      })
  })

  // ─── Watchers ─────────────────────────────────────────────────────────────

  // Recalculate coupon discount when selection changes or is cleared
  watch(selectedCouponId, (newId) => {
    if (newId) {
      redeemedAmt.value = redeemedAmt.value - couponValue.value
      couponValue.value = 0
      const chosen = allCoupons.value?.find((c: any) => c.id === newId?.value)
      if (chosen) {
        const result = calculateDiscount(chosen, grandTotal.value)
        couponValue.value = result
        redeemedAmt.value = redeemedAmt.value + result
      }
    } else {
      redeemedAmt.value = redeemedAmt.value - couponValue.value
      couponValue.value = 0
    }
  })

  // Refresh coupon list + recalculate discount when items or client change
  watch(
    [items, clientId],
    async ([newItems, newClientId]) => {
      if (!newItems || !newClientId) return
      if (selectedCouponId.value) {
        redeemedAmt.value = redeemedAmt.value - couponValue.value
        couponValue.value = 0
        const chosen = allCoupons.value?.find((c: any) => c.id === selectedCouponId.value.value)
        if (chosen) {
          const result = calculateDiscount(chosen, grandTotal.value)
          couponValue.value = result
          redeemedAmt.value = redeemedAmt.value + result
        }
      }
      await couponRefetch()
    },
    { deep: true, immediate: true }
  )

  return {
    allCoupons,
    selectedCouponId,
    eligibleCoupons,
    couponRefetch,
  }
}
