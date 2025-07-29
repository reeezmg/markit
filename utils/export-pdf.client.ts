// utils/export-pdf.client.ts



export async function exportToPDF(data: object[], filename = 'report.pdf', title = 'Report') {
    if (!data.length || typeof window === 'undefined') return
  
    const jsPDF = (await import('jspdf')).default
    const autoTable = (await import('jspdf-autotable')).default
  
    const doc = new jsPDF()
    doc.setFontSize(16)
    doc.text(title, 14, 20)
  
    autoTable(doc, {
      startY: 30,
      head: [Object.keys(data[0])],
      body: data.map(row => Object.values(row)),
    })
  
    doc.save(filename)
  }
