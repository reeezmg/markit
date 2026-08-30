/**
 * Markit's own shipping label.
 *
 * Delhivery's PDF cannot be customised - it prints the raw client code
 * ("8e7348-TheHijabCart-do") instead of the trading name, and its layout is
 * fixed. Their packing_slip endpoint with `pdf=false` returns the same data as
 * JSON precisely so the label can be laid out by the seller. This builds it.
 *
 * The layout mirrors Delhivery's own full-page slip - couriers and pickup staff
 * already know where to look on it - with the seller's real trading name and
 * product names in place of the client code. The label fills the whole page:
 * the item table stretches so the return address and page number sit on the
 * bottom edge, exactly as on the carrier's sheet.
 *
 * This is the only renderer: printing and downloading both go through
 * `renderLabelsPdf`, so the sheet on the printer and the saved file are the
 * same document.
 *
 * The barcode is redrawn rather than reused: the PNG the carrier returns is only
 * 215x119px, about 32 DPI once stretched across a label, too coarse to scan.
 * Delhivery's docs say to render it as Code 128, so JsBarcode draws it as SVG.
 */
import JsBarcode from 'jsbarcode';

export interface LabelPackage {
  wbn: string                 // waybill
  oid?: string                // order id
  cl?: string                 // client code (fallback only)
  snm?: string                // seller name
  sadd?: string               // seller address
  name?: string               // consignee
  address?: string
  pin?: string | number
  contact?: string
  destination?: string        // routing description
  pt?: string                 // "COD" / "Pre-paid"
  cod?: number
  rs?: number                 // declared value
  prd?: string                // product description
  qty?: string | number
  weight?: number             // grams
  si?: string                 // seller invoice number
  cd?: string                 // created date
  mot?: string                // S = surface, E = express
  radd?: string
  rcty?: string
  rst?: string
  rpin?: string | number
  sort_code?: string          // carrier routing code, e.g. "MAN/KKA"
  barcode?: string            // carrier PNG, fallback only
  ewbn?: string[]             // e-way bill numbers
}

const ENTITIES: Record<string, string> = {
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
};

const esc = (v: unknown) => String(v ?? '').replace(/[&<>"']/g, (c) => ENTITIES[c]);

const amount = (v: unknown) =>
  v == null || v === '' ? '' : Number(v).toLocaleString('en-IN', { maximumFractionDigits: 2 });

function labelDate(raw?: string) {
  if (!raw) return '';
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return raw;
  const date = d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }).replace(/ /g, '-');
  const time = d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
  return date + ' | ' + time;
}

const mode = (m?: string) => (m === 'E' ? 'Express' : m === 'S' ? 'Surface' : '');

/**
 * Code-128 as SVG, sized by CSS.
 *
 * JsBarcode writes width/height attributes but no viewBox, and an SVG without a
 * viewBox does not scale - it crops, which is why forcing a CSS height made the
 * barcode disappear. Deriving a viewBox from the generated size is what lets the
 * bars grow and shrink with the label.
 */
function barcodeSvg(value: string, heightMm: number, pngFallback?: string): string {
  try {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    JsBarcode(svg, String(value), {
      format: 'CODE128',
      displayValue: false,
      margin: 0,
      height: 80,
      width: 2,
    });
    // JsBarcode writes these with a "px" suffix; a viewBox must be unitless
    // numbers or the browser ignores it and the barcode stops scaling.
    const w = parseFloat(svg.getAttribute('width') || '');
    const h = parseFloat(svg.getAttribute('height') || '');
    if (w > 0 && h > 0) {
      svg.setAttribute('viewBox', '0 0 ' + w + ' ' + h);
      svg.setAttribute('preserveAspectRatio', 'none');
    }
    svg.setAttribute('width', '100%');
    svg.setAttribute('height', heightMm + 'mm');
    return svg.outerHTML;
  } catch {
    // Never let a barcode problem stop a label printing at all.
    return pngFallback
      ? '<img src="' + esc(pngFallback) + '" alt="' + esc(value) + '" style="height:' + heightMm + 'mm" />'
      : '';
  }
}

function labelBody(pkg: LabelPackage, page = 1, pages = 1): string {
  // The carrier leaves snm blank on shipments manifested before we started
  // sending seller_name; the client code is an ugly last resort, not a choice.
  const seller = (pkg.snm || '').trim() || pkg.cl || '';
  const payment = (pkg.pt || '').toUpperCase().includes('COD') ? 'COD' : 'Prepaid';
  const payLabel = payment + (mode(pkg.mot) ? ' - ' + mode(pkg.mot) : '');
  const due = payment === 'COD' ? pkg.cod : pkg.rs;
  const returnAddr = [pkg.radd, pkg.rcty, pkg.rst, pkg.rpin].filter(Boolean).join(', ');
  const ewb = Array.isArray(pkg.ewbn) ? pkg.ewbn.filter(Boolean).join(', ') : '';

  return [
    '<div class="label">',

    // Header - trading name on the left, carrier wordmark on the right, where
    // pickup staff expect to find it on a manifest slip.
    '  <div class="head">',
    '    <span class="brand-seller">' + esc(seller) + '</span>',
    '    <span class="brand-carrier">DELHIVERY</span>',
    '  </div>',

    '  <div class="awb-line">AWB# <strong>' + esc(pkg.wbn) + '</strong></div>',
    '  <div class="barcode">' + barcodeSvg(pkg.wbn, 22, pkg.barcode) + '</div>',

    '  <div class="row routing">',
    '    <span class="r-pin">' + esc(pkg.pin ?? '') + '</span>',
    '    <span class="r-awb">AWB# ' + esc(pkg.wbn) + '</span>',
    '    <span class="r-sort">' + esc(pkg.sort_code || '') + '</span>',
    '  </div>',

    // Consignee on the left, payment and date boxed on the right.
    '  <div class="row main">',
    '    <div class="cell ship-to">',
    '      <div class="ship-head"><span class="ink">Ship to -</span> ' + esc(pkg.name || '') + '</div>',
    '      <div class="addr ink">' + esc(pkg.address || '') + '</div>',
    pkg.contact ? '      <div class="addr ink">Phone: ' + esc(pkg.contact) + '</div>' : '',
    pkg.destination ? '      <div class="dest-big">' + esc(pkg.destination) + '</div>' : '',
    '      <div class="pin">PIN - ' + esc(pkg.pin ?? '') + '</div>',
    '    </div>',
    '    <div class="cell pay">',
    '      <div class="pay-box">',
    '        <div class="box-label">' + esc(payLabel) + '</div>',
    '        <div class="pay-amt">INR ' + esc(amount(due)) + '</div>',
    pkg.si ? '        <div class="small ink">Invl# ' + esc(pkg.si) + '</div>' : '',
    '      </div>',
    pkg.cd
      ? '      <div class="pay-box"><div class="box-label">Date</div><div class="small ink">' + esc(labelDate(pkg.cd)) + '</div></div>'
      : '',
    '    </div>',
    '  </div>',

    // Seller on the left, the order-number barcode on the right.
    '  <div class="row seller-row">',
    '    <div class="cell seller-block">',
    '      <div><strong>Seller:</strong> ' + esc(seller) + '</div>',
    pkg.sadd ? '      <div class="addr ink">' + esc(pkg.sadd) + '</div>' : '',
    ewb ? '      <div class="addr ink">E-way bill: ' + esc(ewb) + '</div>' : '',
    '    </div>',
    '    <div class="cell order-cell">',
    pkg.oid ? '      <div class="order-no">' + esc(pkg.oid) + '</div>' : '',
    pkg.oid ? '      <div class="order-barcode">' + barcodeSvg(pkg.oid, 12) + '</div>' : '',
    '    </div>',
    '  </div>',

    // The item area stretches into whatever height is left over, which is what
    // keeps the return address and page number on the bottom edge of the page.
    '  <div class="items-area">',
    '    <table class="items">',
    '      <colgroup><col class="c-product"><col class="c-qty"><col class="c-price"><col class="c-total"></colgroup>',
    '      <thead><tr><th>Product Name</th><th class="num">Qty.</th><th class="num">Price</th><th class="num">Total</th></tr></thead>',
    '      <tbody><tr>',
    '        <td class="ink">' + esc(pkg.prd || 'Merchandise') + '</td>',
    '        <td class="num ink">' + esc(pkg.qty ?? 1) + '</td>',
    '        <td class="num ink">' + esc(amount(pkg.rs)) + '</td>',
    '        <td class="num ink">' + esc(amount(pkg.rs)) + '</td>',
    '      </tr></tbody>',
    '    </table>',
    '  </div>',

    '  <div class="foot">',
    '    <span class="return ink">Return Address: ' + esc(returnAddr) + '</span>',
    '    <span class="page-no ink">Page ' + page + ' of ' + pages + '</span>',
    '  </div>',
    '</div>',
  ].filter(Boolean).join('\n');
}

const STYLES = [
  '* { box-sizing: border-box; }',
  // Flex children default to min-width:auto, so one long unbroken string pushes
  // its row past the page edge and the right-hand side prints clipped.
  '.row > * { min-width: 0; }',
  '.label, .label * { overflow-wrap: anywhere; }',
  'html, body { margin: 0; padding: 0; width: 100%; height: 100%; }',
  'body { font-family: Arial, Helvetica, sans-serif; color: #000; -webkit-print-color-adjust: exact; print-color-adjust: exact; }',
  // A full-page box: the header block sits at the top, the item area stretches,
  // and the footer rides the bottom border.
    // ---- spacing knobs -------------------------------------------------
  // Every band's padding derives from these three. Raise --pad-bottom to put
  // more air under the text in every band at once; --pad-x moves the left and
  // right edges. The per-band calc() offsets below are ink corrections: text
  // sits low in its line box, so equal numbers do not print as equal gaps.
  // Arial's glyphs sit low inside their line box. Keep the total vertical
  // padding unchanged, but move 4px from above the text to below it so labels
  // have an even visual gap on both sides of every horizontal rule.
  '.label { --pad-x: 11px; --pad-top: 7px; --pad-bottom: 24px;',
  '  width: 100%; min-height: 100%; border: 1px solid #000; display: flex; flex-direction: column; page-break-after: always; page-break-inside: avoid; }',
  '.label:last-child { page-break-after: auto; }',
  // Everything prints black - a colour label costs more to print and the rust
  // body copy did nothing a scanner or a courier reads.
  '.ink { color: #000; }',
  '.row { display: flex; align-items: stretch; }',
  '.cell { padding: var(--pad-top) var(--pad-x) var(--pad-bottom); }',
  '.head { display: flex; align-items: center; justify-content: space-between; gap: 8px; padding: var(--pad-top) var(--pad-x) calc(var(--pad-bottom) + 3px); border-bottom: 1px solid #000; line-height: 1.2; }',
  '.brand-seller { font-size: 1.35em; font-weight: 700; }',
  '.brand-carrier { font-size: 1.8em; font-weight: 900; letter-spacing: 1.5px; white-space: nowrap; }',
  '.awb-line { padding: var(--pad-top) var(--pad-x) var(--pad-bottom); font-size: 1.35em; line-height: 1.2; }',
  '.barcode { display: flex; justify-content: center; padding: var(--pad-top) var(--pad-x); }',
  '.barcode svg, .barcode img { display: block; flex: 0 0 60%; width: 60%; }',
  '.routing { border-top: 1px solid #000; border-bottom: 1px solid #000; padding: calc(var(--pad-top) - 4px) var(--pad-x) calc(var(--pad-bottom) - 4px); font-size: 1em; line-height: 1.2; align-items: center; }',
  '.r-pin { flex: 0 0 auto; }',
  '.r-awb { flex: 1 1 auto; text-align: center; font-weight: 700; white-space: nowrap; }',
  '.r-sort { flex: 0 0 auto; text-align: right; }',
  '.main { border-bottom: 1px solid #000; }',
  '.ship-to { flex: 1 1 auto; border-right: 1px solid #000; }',
  '.ship-head { font-size: 1.4em; font-weight: 700; margin-bottom: 5px; }',
  '.addr { font-size: 1.05em; line-height: 1.45; }',
  '.dest-big { font-size: 1.4em; font-weight: 700; margin-top: 7px; line-height: 1.25; }',
  '.pin { font-weight: 700; font-size: 1.2em; margin-top: 5px; }',
  '.pay { flex: 0 0 36%; padding: 0; display: flex; flex-direction: column; }',
  '.pay-box { padding: var(--pad-top) var(--pad-x) calc(var(--pad-bottom) + 1px); }',
  '.pay-box + .pay-box { border-top: 1px solid #000; }',
  '.box-label { font-weight: 700; font-size: 1.05em; }',
  '.pay-amt { font-size: 1.5em; font-weight: 700; margin-top: 3px; }',
  '.small { font-size: 1em; }',
  '.seller-row { border-bottom: 1px solid #000; }',
  '.seller-block { flex: 1 1 auto; border-right: 1px solid #000; display: flex; flex-direction: column; justify-content: center; }',
  '.order-cell { flex: 0 0 36%; display: flex; align-items: center; gap: 10px; }',
  '.order-no { flex: 0 0 auto; font-weight: 700; font-size: 1.1em; }',
  '.order-barcode { flex: 1 1 auto; min-width: 0; }',
  '.order-barcode svg { display: block; width: 100%; }',
  // Fixed layout stops a long product name shoving the money columns off-page.
  '.items-area { flex: 1 1 auto; }',
  '.items { width: 100%; table-layout: fixed; border-collapse: collapse; }',
  '.items th, .items td { padding: calc(var(--pad-top) - 2px) var(--pad-x); text-align: left; vertical-align: top; line-height: 1.2; }',
  '.items thead th { padding-bottom: calc(var(--pad-bottom) - 3px); }',
  '.items tbody td { padding-bottom: var(--pad-bottom); }',
  '.items thead th { border-bottom: 1px solid #000; font-size: 1.05em; font-weight: 700; }',
  '.items col.c-product { width: 55%; }',
  '.items col.c-qty { width: 12%; }',
  '.items col.c-price { width: 16%; }',
  '.items col.c-total { width: 17%; }',
  '.items .num { text-align: right; }',
  '.foot { display: flex; align-items: baseline; justify-content: space-between; gap: 12px; padding: var(--pad-top) var(--pad-x) calc(var(--pad-bottom) + 1px); line-height: 1.35; font-size: .95em; }',
  '.return { flex: 1 1 auto; }',
  '.page-no { flex: 0 0 auto; white-space: nowrap; }',
].join('\n');

/** Page size in millimetres, matching the print layout. */
const PAGE_MM: Record<'A4' | '4R', { w: number; h: number; margin: number }> = {
  A4: { w: 210, h: 297, margin: 12 },
  '4R': { w: 101.6, h: 152.4, margin: 4 },
};

/**
 * Render the labels to a PDF document.
 *
 * Rendered off-screen at 3x so the barcode lands around 250 DPI - comfortably
 * scannable. Both printing and downloading go through here, so what comes out
 * of the printer and what lands in the Downloads folder are the same document.
 */
async function renderLabelsPdf(packages: LabelPackage[], size: 'A4' | '4R' = 'A4') {
  const [{ default: html2canvas }, { jsPDF }] = await Promise.all([
    import('html2canvas'),
    import('jspdf'),
  ]);

  const page = PAGE_MM[size] || PAGE_MM.A4;
  const pdf = new jsPDF({ unit: 'mm', format: [page.w, page.h], orientation: 'portrait' });
  const usableW = page.w - page.margin * 2;
  const usableH = page.h - page.margin * 2;

  // Off-screen, but laid out for real - html2canvas cannot measure display:none.
  const stage = document.createElement('div');
  stage.style.cssText = `position:fixed;left:-10000px;top:0;width:${usableW}mm;background:#fff;`;
  const style = document.createElement('style');
  style.textContent = STYLES;
  stage.appendChild(style);
  document.body.appendChild(stage);

  try {
    for (let i = 0; i < packages.length; i++) {
      const holder = document.createElement('div');
      holder.innerHTML = labelBody(packages[i], i + 1, packages.length);
      // Give the holder the printable area's exact height so the label's
      // stretch-to-fill layout fills the page instead of ending mid-sheet.
      holder.style.cssText = `width:${usableW}mm;height:${usableH}mm;background:#fff;`;
      holder.style.fontSize = size === '4R' ? '11px' : '15px';
      stage.appendChild(holder);

      const canvas = await html2canvas(holder, { scale: 3, backgroundColor: '#ffffff', logging: false });
      // Scale to fit, keeping the aspect ratio - clamping only the height would
      // squash the label and distort the barcode.
      const ratio = canvas.height / canvas.width;
      let w = usableW;
      let h = w * ratio;
      if (h > usableH) { h = usableH; w = h / ratio; }
      if (i > 0) pdf.addPage([page.w, page.h], 'portrait');
      // 'FAST' deflates the bitmap on the way in. Without it jsPDF stores raw
      // RGB - around 26MB per A4 page at this scale, which is a painful file to
      // download and a slow one to spool to a printer.
      pdf.addImage(
        canvas.toDataURL('image/png'), 'PNG',
        page.margin + (usableW - w) / 2, page.margin, w, h,
        `label-${i}`, 'FAST',
      );
      stage.removeChild(holder);
    }
    return pdf;
  } finally {
    document.body.removeChild(stage);
  }
}

/** Save the labels as a PDF file. */
export async function downloadLabelsPdf(
  packages: LabelPackage[],
  size: 'A4' | '4R' = 'A4',
  filename = 'shipping-labels.pdf',
): Promise<void> {
  const pdf = await renderLabelsPdf(packages, size);
  pdf.save(filename);
}

/**
 * Print the very same PDF the download produces, without leaving the page.
 *
 * The old path opened a blank tab and printed HTML from it, which meant a
 * pop-up to allow, a tab to close afterwards, and a printout that could drift
 * from the saved file. Here the PDF is loaded into a hidden iframe on the
 * current page and printed from there: same tab, same document, no pop-up.
 *
 * `autoPrint` embeds an open-action in the PDF so the built-in viewer raises
 * the dialog itself; the explicit print() call covers viewers that ignore it.
 */
export async function printLabelsPdf(
  packages: LabelPackage[],
  size: 'A4' | '4R' = 'A4',
): Promise<void> {
  const pdf = await renderLabelsPdf(packages, size);
  pdf.autoPrint();
  const url = URL.createObjectURL(pdf.output('blob'));

  const frame = document.createElement('iframe');
  frame.style.cssText = 'position:fixed;right:0;bottom:0;width:1px;height:1px;border:0;opacity:0;';
  // Ask for the dialog once the viewer has the document, but never wait on it:
  // a browser without a built-in PDF viewer fires no load event at all, and a
  // print dialog is modal, so awaiting either one would hang the caller.
  frame.onload = () => {
    try {
      frame.contentWindow?.focus();
      frame.contentWindow?.print();
    } catch {
      // Some viewers refuse a scripted print; autoPrint has already asked.
    }
  };
  frame.src = url;
  document.body.appendChild(frame);

  // Keep the frame alive while the dialog is open - removing it immediately
  // cancels the job in Chrome - then clean up so repeated prints do not stack.
  window.setTimeout(() => {
    URL.revokeObjectURL(url);
    frame.remove();
  }, 60_000);
}
