import jsPDF from "jspdf";

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
  const footerHeight = 90;
  const finalHeight = headerHeight + itemHeight + footerHeight;

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
  center(`${data.companyAddress.name}, ${data.companyAddress.street}` || "", 10);
  center(`${data.companyAddress.locality}, ${data.companyAddress.city}` || "", 10);
  center(`${data.companyAddress.state}- ${data.companyAddress.pincode}` || "", 10);
  if (data.gstin) center(`GSTIN: ${data.gstin}`);

  y += 2;
  line();
  y += 5;

  // ---------------------- BILL INFO ----------------------
  txt(`Invoice: ${data.invoiceNumber}`);
  txt(`Date: ${new Date(data.date).toLocaleString()}`);
  txt(`Payment Method: ${data.paymentMethod}`);

  line();
  y += 5;

  // ---------------------- TABLE HEADERS ----------------------
  doc.setFont("courier", "bold");
  doc.text("SL", 5, y);
  doc.text("DESCRIPTION", 15, y);
  doc.text("QTY", 50, y);
  doc.text("MRP", 65, y);
  doc.text("DISC", 85, y);
  doc.text("HSN", 102, y);
  y += 5;
  doc.text("TAX", 85, y);
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
    doc.text(String(item.discount || 0), 85, y);
    doc.text(String(item.hsn || ""), 102, y);

    // Remaining description lines (if any)
    for (let j = 1; j < descLines.length; j++) {
      y += 5;
      doc.text(descLines[j], 15, y);
    }

    // TAX + VALUE next line
    y += 5;
    doc.text(`${item.tax}%`, 85, y);
    doc.text(String(item.value || 0), 102, y);

    // Extra spacing between items
    y += 6;
  });

  y += 2;
  line();
  y += 5;

  // ---------------------- TOTALS ----------------------
  const totalQty = data.entries.reduce((sum: number, item: any) => sum + (item.qty || 0), 0);
  const totalMrp = data.entries.reduce((sum: number, item: any) => sum + (item.mrp || 0), 0);
  const totalDiscount = data.entries.reduce((sum: number, item: any) => sum + (item.discount || 0), 0);
  const totalValue = data.entries.reduce((sum: number, item: any) => sum + (item.value || 0), 0);

  doc.text(String(totalQty), 50, y);
  doc.text(String(totalMrp.toFixed(2)), 65, y);
  doc.text(String(totalDiscount.toFixed(2)), 85, y);
  doc.text(String(totalValue.toFixed(2)), 102, y);

  y += 4;
  line();
  y += 5;

  doc.text(
    `DISC/ROUND OFF(+/-): ${data.discount}`,
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

  // ---------------------- SAVINGS ----------------------
  doc.setFontSize(12);
  doc.setFont("courier", "bold");
  doc.rect(5, y, pageWidth - 10, 10);
  doc.text(`YOUR SAVING: ${data.tdiscount || 0}`, pageWidth / 2, y + 7, {
    align: "center",
  });

  y += 20;

  // ---------------------- FOOTER ----------------------
  doc.setFont("courier", "normal");
  doc.setFontSize(11);

  center("Thank you for shopping!");
  center("Returns accepted within 7 days");
  center("with original receipt");
  center(`Customer care: ${data.phone || ""}`);

  doc.save(filename);
}
