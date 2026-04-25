import jsPDF from "jspdf";
import JsBarcode from "jsbarcode";

function formatCouponDiscount(coupon: any) {
  if (!coupon) return "";
  if (coupon.type === "PERCENTAGE") {
    const max = coupon.maxDiscountAmount ? ` max ${Number(coupon.maxDiscountAmount).toFixed(2)}` : "";
    return `${Number(coupon.discountValue || 0).toFixed(2)}% off${max}`;
  }
  if (coupon.type === "FLAT") {
    return `${Number(coupon.discountValue || 0).toFixed(2)} off`;
  }
  return "Gift coupon";
}

function createBarcodeDataUrl(value: string) {
  const canvas = document.createElement("canvas");
  JsBarcode(canvas, value, {
    format: "CODE128",
    width: 2,
    height: 45,
    displayValue: true,
    font: "monospace",
    fontSize: 14,
    margin: 4,
  });
  return canvas.toDataURL("image/png");
}

export async function generateThermalReceiptPDF(data: any, filename = "receipt.pdf") {
  if (typeof window === "undefined") return;

  const pageWidth = 127; // 5-inch thermal width

  // Estimate dynamic height based on wrapped text
  const estimateHeightPerEntry = (entry: any, doc: any) => {
    const descLines = doc.splitTextToSize(entry.description || "", 30);
    return 12 + descLines.length * 5; // approx per item row
  };

  // Temporary doc for calculating wrapped lines
  const tempDoc = new jsPDF({ unit: "mm" });
  const itemHeight = data.entries.reduce(
    (sum: number, item: any) => sum + estimateHeightPerEntry(item, tempDoc),
    0
  );

  const headerHeight = 90;
  const generatedCoupons = Array.isArray(data.generatedCoupons) ? data.generatedCoupons : [];
  const footerHeight = 90 + generatedCoupons.length * 48;
  const finalHeight = headerHeight + itemHeight + footerHeight;

  function cleanJoin(a?: string, b?: string) {
  const left = a?.trim() || "";
  const right = b?.trim() || "";

  if (left && right) return `${left}, ${right}`;
  if (left) return left;
  if (right) return right;
  return "";
}

   const discStr = String(data.discount ?? '')
   const calculatedDiscount = discStr.startsWith('+')
      ? 0
      : Number(data.discount) < 0
        ? Math.abs(Number(data.discount))
        : (data.subtotal * Number(data.discount)) / 100;


  // Now create final PDF
  const doc = new jsPDF({
    unit: "mm",
    format: [pageWidth, finalHeight],
  });

  doc.setFont("courier", "normal");

  let y = 10;

  const line = () => {
    doc.setLineWidth(0.2);
    doc.line(5, y, pageWidth - 5, y);
  };

  const txt = (t: any, x = 5, size = 10, bold = false) => {
    doc.setFontSize(size);
    doc.setFont("courier", bold ? "bold" : "normal");
    doc.text(String(t), x, y);
    y += 5;
  };

  const center = (t: any, size = 12, bold = false) => {
    doc.setFontSize(size);
    doc.setFont("courier", bold ? "bold" : "normal");
    doc.text(String(t), pageWidth / 2, y, { align: "center" });
    y += 5;
  };

  // ---------------------- HEADER ----------------------
  center(data.companyName, 14, true);
center(
  cleanJoin(data.companyAddress?.name, data.companyAddress?.street),
  10
)


center(
  cleanJoin(data.companyAddress?.locality, data.companyAddress?.city),
  10
)

center(
  cleanJoin(data.companyAddress?.state, data.companyAddress?.pincode),
  10
)

  if (data.gstin) center(`GSTIN: ${data.gstin}`);

  y += 2;
  line();
  y += 5;

  // ---------------------- BILL INFO ----------------------
  txt(`Invoice: ${data.invoiceNumber}`);
  txt(`Date: ${new Date(data.date).toLocaleString()}`);
  txt(`Payment Method: ${data.paymentMethod}`);
  if (data.clientName){
      txt(`Client Name: ${data.clientName}`);
      txt(`Client Phone: ${data.clientPhone}`);
  }
  if (Number(data.availablePoints || 0) > 0) {
    txt(`Total Points Available: ${data.availablePoints}`);
  }


  line();
  y += 5;

  // ---------------------- TABLE HEADERS ----------------------
  doc.setFont("courier", "bold");
  doc.text("SL", 5, y);
  doc.text("DESCRIPTION", 15, y);
  doc.text("QTY", 50, y);
  doc.text("MRP", 65, y);

  doc.text("TAX", 85, y);
    doc.text("DISC", 102, y);


  y += 5;
  doc.text("HSN", 85, y);
    doc.text("T.VALUE", 102, y);

  y += 6;
  doc.setFont("courier", "normal");

  // ---------------------- ITEM ROWS WITH WRAPPED DESCRIPTION ----------------------
  data.entries.forEach((item: any, i: number) => {
    // Wrap description (fits 30mm width)
    const descLines = doc.splitTextToSize(item.description || "", 30);

    // SL number on first line
    doc.text(String(i + 1), 5, y);

    // First line of description
    doc.text(descLines[0], 15, y);

    // Right-side columns SAME LINE
    doc.text(String(item.qty), 50, y);
    doc.text(String(item.mrp), 65, y);
    doc.text(`${item.tax}%`, 85, y);
     doc.text(String(item.discount || 0), 102, y);
 

    // Remaining description lines (if any)
    for (let j = 1; j < descLines.length; j++) {
      y += 5;
      doc.text(descLines[j], 15, y);
    }

    // TAX + VALUE next line
    y += 5;
   
     doc.text(String(item.hsn || ""), 85, y);
    doc.text(String(item.value || 0), 102, y);
  

    // Extra spacing between items
    y += 6;
  });

  y += 2;
  line();
  y += 5;

  // ---------------------- TOTALS ----------------------
const totalQty = data.entries.reduce((sum: number, item: any) => sum + (Number(item.qty) || 0), 0);
const totalMrp = data.entries.reduce((sum: number, item: any) => sum + (Number(item.mrp) || 0), 0);
const totalDiscount = data.entries.reduce((sum: number, item: any) => sum + (Number(item.discount) || 0), 0);
const totalValue = data.entries.reduce((sum: number, item: any) => sum + (Number(item.value) || 0), 0);

// When printing, ensure we call toFixed on numbers
doc.text(String(totalQty), 50, y);
doc.text(Number(totalMrp).toFixed(2), 65, y);
doc.text(Number(totalDiscount).toFixed(2), 85, y);
doc.text(Number(totalValue).toFixed(2), 102, y);

  y += 4;
  line();
  y += 5;

  doc.text(
    `DISC/ROUND OFF(+/-): ${discStr.startsWith('+') ? 'Add ' + discStr : data.discount}`,
    pageWidth / 2,
    y,
    { align: "center" }
  );
  y += 7;

  // ---------------------- GRAND TOTAL ----------------------
  doc.setFontSize(16);
  doc.setFont("courier", "bold");
  doc.text(
    `GRAND TOTAL: ${data.grandTotal}`,
    pageWidth / 2,
    y + 7,
    { align: "center" }
  );
  y += 15;

  if (Number(data.redeemedPoints || 0) > 0) {
    center(`Points Redeemed: ${data.redeemedPoints}`, 10, true);
  }
  if (Number(data.couponValue || 0) > 0) {
    center(`Coupon Discount: ${Number(data.couponValue).toFixed(2)}`, 10, true);
  }

  // ---------------------- SAVINGS ----------------------
  doc.setFontSize(12);
  doc.setFont("courier", "bold");
  doc.rect(5, y, pageWidth - 10, 10);
const saving = Number(
  calculatedDiscount +
  (Number(data.tdiscount) || 0) +
  (Number(data.couponValue) || 0) +
  (Number(data.redeemedPoints) || 0)
).toFixed(2);

doc.text(`YOUR SAVING: ${saving}`, pageWidth / 2, y + 7, {
  align: "center",
});


  y += 20;

  // ---------------------- FOOTER ----------------------
  doc.setFont("courier", "normal");
  doc.setFontSize(11);
if (data.thankYouNote){
  center(data.thankYouNote);
}
if (data.returnPolicy){
  center(data.returnPolicy);
}
if(data.refundPolicy){
    center(data.refundPolicy);
  }
  if (data.phone){
    center(`Customer care: ${data.phone || ""}`);
  }

  if (generatedCoupons.length) {
    y += 4;
    line();
    y += 6;
    center("COUPON EARNED", 13, true);

    for (const coupon of generatedCoupons) {
      const couponNumber = coupon.code || coupon.couponNumber || coupon.id || "";
      center(couponNumber, 16, true);
      center(coupon.code || "", 10, true);
      center(formatCouponDiscount(coupon), 10);
      if (coupon.minOrderValue) center(`Min order: ${Number(coupon.minOrderValue).toFixed(2)}`, 9);
      if (coupon.endDate) center(`Valid till: ${new Date(coupon.endDate).toLocaleDateString()}`, 9);

      const barcode = createBarcodeDataUrl(couponNumber);
      doc.addImage(barcode, "PNG", 20, y, pageWidth - 40, 22);
      y += 28;
      line();
      y += 6;
    }
  }
  

  doc.save(filename);
}

