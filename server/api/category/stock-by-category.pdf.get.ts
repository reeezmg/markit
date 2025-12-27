import { defineEventHandler, createError, setHeader } from 'h3'
import { pool } from '~/server/db'
import { jsPDF } from 'jspdf'

export default defineEventHandler(async (event) => {
  const session = await useAuthSession(event)
  const companyId = session.data.companyId

  if (!companyId) {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  }

  const client = await pool.connect()

  try {
    /* ------------------------------------
       1. FETCH STOCK DATA
    ------------------------------------ */
    const res = await client.query(
      `
      WITH stock AS (
        SELECT
          c.id   AS category_id,
          c.name AS category_name,
          sc.id  AS subcategory_id,
          sc.name AS subcategory_name,
          COALESCE(SUM(i.qty), 0) AS qty
        FROM categories c
        LEFT JOIN products p
          ON p.category_id = c.id
         AND p.company_id = $1
        LEFT JOIN subcategories sc
          ON sc.id = p.subcategory_id
        LEFT JOIN variants v
          ON v.product_id = p.id
        LEFT JOIN items i
          ON i.variant_id = v.id
        WHERE c.company_id = $1
        GROUP BY c.id, c.name, sc.id, sc.name
      )
      SELECT
        category_name AS name,
        SUM(qty) AS qty,
        COALESCE(
          json_agg(
            json_build_object(
              'name', subcategory_name,
              'qty', qty
            )
          ) FILTER (WHERE subcategory_id IS NOT NULL),
          '[]'
        ) AS subcategories
      FROM stock
      GROUP BY category_id, category_name
      ORDER BY category_name;
      `,
      [companyId]
    )

    /* ------------------------------------
       2. PDF SETUP
    ------------------------------------ */
    const doc = new jsPDF({ unit: 'mm', format: 'a4' })
    const pageHeight = doc.internal.pageSize.height
    const pageWidth = doc.internal.pageSize.width
    const margin = 15
    let y = margin
    let pageNo = 1

    const addFooter = () => {
      doc.setFontSize(9)
      doc.setTextColor(130)
      doc.text(`Page ${pageNo}`, pageWidth / 2, pageHeight - 10, {
        align: 'center'
      })
    }

    /* ------------------------------------
       3. HEADER
    ------------------------------------ */
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(18)
    doc.text('MARKIT', margin, y)

    y += 8
    doc.setFontSize(13)
    doc.text('Category-wise Stock Report', margin, y)

    y += 6
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(10)
    doc.setTextColor(120)
    doc.text(`Generated on: ${new Date().toLocaleDateString()}`, margin, y)

    y += 12
    doc.setTextColor(0)

    /* ------------------------------------
       4. CONTENT
    ------------------------------------ */
    for (const category of res.rows) {
      if (y > pageHeight - 50) {
        addFooter()
        pageNo++
        doc.addPage()
        y = margin
      }

      /* ---------- CATEGORY HEADER ---------- */
      doc.setDrawColor(0)
      doc.setLineWidth(0.4)
      doc.line(margin, y, pageWidth - margin, y)
      y += 7

      doc.setFont('helvetica', 'bold')
      doc.setFontSize(12)
      doc.text(`CATEGORY: ${category.name.toUpperCase()}`, margin, y)
      doc.text(`TOTAL QTY: ${category.qty}`, pageWidth - margin, y, {
        align: 'right'
      })

      y += 5
      doc.line(margin, y, pageWidth - margin, y)
      y += 8

      /* ---------- TABLE HEADER ---------- */
      const tableStartY = y
      const rowHeight = 7
      const col1X = margin
      const col2X = pageWidth - margin - 20

      doc.setFillColor(240, 242, 245)
      doc.rect(margin, y - 5, pageWidth - margin * 2, rowHeight, 'F')

      doc.setFontSize(10)
      doc.setFont('helvetica', 'bold')
      doc.text('Subcategory', col1X + 2, y)
      doc.text('Qty', col2X + 18, y, { align: 'right' })

      y += rowHeight
      doc.setFont('helvetica', 'normal')

      /* ---------- TABLE ROWS ---------- */
      if (!category.subcategories.length) {
        doc.setTextColor(150)
        doc.text('No data available', col1X + 2, y)
        doc.setTextColor(0)
        y += rowHeight
      } else {
        let alternate = false

        for (const sub of category.subcategories) {
          if (y > pageHeight - 30) {
            addFooter()
            pageNo++
            doc.addPage()
            y = margin
          }

          if (alternate) {
            doc.setFillColor(250, 250, 250)
            doc.rect(margin, y - 5, pageWidth - margin * 2, rowHeight, 'F')
          }

          doc.text(sub.name, col1X + 2, y)
          doc.text(String(sub.qty), col2X + 18, y, { align: 'right' })

          alternate = !alternate
          y += rowHeight
        }
      }

      y += 8
    }

    addFooter()

    /* ------------------------------------
       5. RETURN PDF
    ------------------------------------ */
    const pdfBuffer = Buffer.from(doc.output('arraybuffer'))

    setHeader(event, 'Content-Type', 'application/pdf')
    setHeader(
      event,
      'Content-Disposition',
      'attachment; filename="category-stock-report.pdf"'
    )

    return pdfBuffer
  } finally {
    client.release()
  }
})
