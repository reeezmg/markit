/**
 * Shipping label actions shared by the orders table and the ship modal.
 *
 * Both screens print the same label, download the same PDF and offer the same
 * carrier fallback; before this composable each kept its own copy, and the two
 * had already drifted (different file names, different error wording).
 *
 * The label itself is drawn in `utils/shipping-label.client.ts` — see that file
 * for why we render our own instead of printing the carrier's fixed PDF.
 */
export function useShippingLabels() {
  const toast = useToast();

  /**
   * Carrier label PDF, streamed through our own server.
   *
   * Same-origin on purpose: the carrier's URL is cross-origin, may need carrier
   * auth, and cannot be embedded for printing. The route also generates the
   * label on demand when the order does not have one yet.
   */
  const labelPdfUrl = (awb: string, mode: 'inline' | 'download', name?: string) =>
    `/api/ecommerce-cms/shipping/label-pdf?trackingId=${encodeURIComponent(awb)}&mode=${mode}`
    + (name ? `&name=${encodeURIComponent(name)}` : '');

  /** Start a browser download without navigating away from the page. */
  function triggerDownload(url: string) {
    const a = document.createElement('a');
    a.href = url;
    a.rel = 'noopener';
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  /** The carrier's own PDF, exactly as they generate it. */
  const downloadCarrierPdf = (awb: string) =>
    triggerDownload(labelPdfUrl(awb, 'download', `carrier-${awb}`));

  /** Raw label data (barcode included) for one or more waybills. */
  async function fetchLabelData(awbs: string[]) {
    const res: any = await $fetch('/api/ecommerce-cms/shipping/label-data', {
      query: { waybills: awbs.join(',') },
    });
    const packages = res?.packages || [];
    if (!packages.length) throw new Error('The carrier returned no label data');
    return { packages, size: (res.size === '4R' ? '4R' : 'A4') as '4R' | 'A4' };
  }

  function labelError(title: string, e: any) {
    toast.add({
      title,
      description: carrierError(e),
      color: 'red',
      timeout: 0,
      ui: { description: 'whitespace-pre-line' },
    });
  }

  /** Print Markit's label — same document the download produces, same tab. */
  async function printLabels(awbs: string[]) {
    const valid = awbs.filter(Boolean);
    if (!valid.length) { toast.add({ title: 'No labels to print', color: 'orange' }); return; }

    const preparing = toast.add({ title: valid.length > 1 ? 'Preparing labels…' : 'Preparing label…', timeout: 0 });
    try {
      const { packages, size } = await fetchLabelData(valid);
      await printLabelsPdf(packages, size);
    } catch (e: any) {
      labelError('Could not build the label', e);
    } finally {
      toast.remove(preparing.id);
    }
  }

  /** Save Markit's label as a PDF file. */
  async function downloadLabels(awbs: string[], filename?: string) {
    const valid = awbs.filter(Boolean);
    if (!valid.length) { toast.add({ title: 'No labels to download', color: 'orange' }); return; }

    try {
      const { packages, size } = await fetchLabelData(valid);
      await downloadLabelsPdf(packages, size,
        filename || (valid.length === 1 ? `label-${valid[0]}.pdf` : `shipping-labels-${valid.length}.pdf`));
    } catch (e: any) {
      labelError('Could not build the label PDF', e);
    }
  }

  return { labelPdfUrl, triggerDownload, downloadCarrierPdf, printLabels, downloadLabels };
}
