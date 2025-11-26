import jsPDF from "jspdf";

export async function generateThermalReceiptPDF(data: any, filename = "receipt.pdf") {
  if (typeof window === "undefined") return;

 const pageWidth = 127; // 5-inch paper

// baseline heights
const headerHeight = 90;
const itemHeight = data.entries.length * 10;
const footerHeight = 90;

// total height
const finalHeight = headerHeight + itemHeight + footerHeight;

// now create pdf with correct height
const doc = new jsPDF({
  unit: "mm",
  format: [pageWidth, finalHeight]
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
  center("underlined");
  center("underlined");
  center("underlined");
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

  // ---------------------- ITEM ROWS ----------------------
  data.entries.forEach((item: any, i: number) => {
    doc.text(String(i + 1), 5, y);
    doc.text(item.description || "", 15, y);

    doc.text(String(item.qty), 50, y);
    doc.text(String(item.mrp), 65, y);
    doc.text(String(item.discount || 0), 85, y);
    doc.text(String(item.hsn || ""), 102, y);

    y += 5;

    doc.text(`${item.tax}%`, 85, y);
    doc.text(String(item.value || 0), 102, y);

    y += 5;
  });

  y += 2;
  line();
  y += 5;
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
  doc.text(`DISC/ROUND OFF(+/-): ${data.discount}`,pageWidth/2,y,{ align: "center" });
  y += 7;

  // ---------------------- GRAND TOTAL VERTICAL ----------------------

  doc.setFontSize(16);
  doc.setFont("courier", "bold");
  doc.text(`GRAND TOTAL: ${data.grandTotal}`,pageWidth / 2, y + 7, { align: "center" });
  y += 15;
  // ---------------------- SAVING BOX ----------------------
  doc.setFontSize(12);
  doc.setFont("courier", "bold");
  doc.rect(5, y, pageWidth - 10, 10);
  doc.text(`YOUR SAVING: ${data.tdiscount || 0}`, pageWidth / 2, y + 7, { align: "center" });

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
