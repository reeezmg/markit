export interface DocumentListState {
  q: string
  state: string
  status: string
  from: string
  to: string
  min: string
  max: string
  page: number
  pageSize: number
  sort: string
  order: 'asc' | 'desc'
}

export const documentListDefaults = (sort: string): DocumentListState => ({
  q: '', state: '', status: '', from: '', to: '', min: '', max: '',
  page: 1, pageSize: 20, sort, order: 'desc',
})

/** Capture filters before asynchronous exports so changing the screen cannot mix result sets. */
export async function documentExportRows(
  load: (query: DocumentListState) => Promise<{ rows: any[]; total: number }>,
  filters: DocumentListState,
) {
  const snapshot = { ...filters, page: 1, pageSize: 500 }
  const first = await load(snapshot)
  const rows = [...first.rows]
  for (let page = 2; (page - 1) * 500 < first.total; page++) {
    const next = await load({ ...snapshot, page })
    rows.push(...next.rows)
  }
  return rows
}
