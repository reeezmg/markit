/**
 * Shipment lifecycle actions shared by the orders table and the ship modal.
 *
 * Cancelling is the same operation from either screen, with the same warning
 * and the same consequences — only what happens afterwards differs (the table
 * reloads, the modal closes), so the caller handles that.
 */
export function useShipmentActions() {
  const toast = useToast();

  /**
   * Release the waybill at the carrier and put the order back to Packed.
   *
   * Returns true when the carrier accepted the cancellation, false when the
   * seller backed out of the confirmation or the carrier refused.
   */
  async function cancelShipment(awb: string, orderId: string, orderRef?: string): Promise<boolean> {
    if (!awb) return false;
    const subject = orderRef ? `shipment ${awb} for order ${orderRef}` : `shipment ${awb}`;
    if (!window.confirm(
      `Cancel ${subject}?\n\n`
      + 'The waybill is released at the carrier and the order goes back to Packed, '
      + 'so you can create a new shipment for it.')) return false;

    try {
      await $fetch('/api/ecommerce-cms/shipping/cancel', { method: 'POST', body: { awb, orderId } });
      toast.add({
        title: `Shipment ${awb} cancelled`,
        description: 'The order is back to Packed — you can ship it again.',
        color: 'green',
        timeout: 6000,
      });
      return true;
    } catch (e: any) {
      toast.add({
        title: 'Could not cancel',
        description: carrierError(e),
        color: 'red',
        timeout: 0,
        ui: { description: 'whitespace-pre-line' },
      });
      return false;
    }
  }

  return { cancelShipment };
}
