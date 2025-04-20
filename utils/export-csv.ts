
export function exportToCSV(data: object[], filename = 'report.csv') {
    if (!data.length) return
  
    const escape = (val: unknown) => `"${String(val).replace(/"/g, '""')}"`
  
  const csv = [
    Object.keys(data[0]).join(','),
    ...data.map(row => Object.values(row).map(escape).join(','))
  ].join('\n')
  
  
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
  
    const link = document.createElement('a')
    link.setAttribute('href', url)
    link.setAttribute('download', filename)
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }
  
  
  