export function useBillEvents() {
  const BillStore = useBillStore()
  const { $socket } = useNuxtApp()

  const handleBillSuccess = (data: any) => {
    const toast = useToast()
    BillStore.notifyUpdate()

    const kept = data?.keptItems?.map((i: any) => `${i.name} ×${i.quantity}`).join(', ') || '—'
    const returned = data?.returnedItems?.length
      ? data.returnedItems.map((i: any) => `${i.name} ×${i.quantity}`).join(', ')
      : null

    const description = [
      `Bought: ${kept}`,
      returned ? `Returned: ${returned}` : null,
      `Grand total: ₹${data?.grandTotal ?? '—'}`,
    ].filter(Boolean).join(' · ')

    toast.add({
      title: `New bill — Markit Order #${data?.orderNumber}, Bill #${data?.invoiceNumber}`,
      description,
      color: 'green',
      icon: 'i-heroicons-check-circle',
      timeout: 8000,
    })
  }

  onMounted(() => {
    $socket.on('bill:success', handleBillSuccess)
  })

  onBeforeUnmount(() => {
    $socket.off('bill:success', handleBillSuccess)
  })
}
