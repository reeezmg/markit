/** Customer-facing text shared by bills, invoices and converted quotes. */
export function documentNotes(value: { notes?: unknown; termsAndConditions?: unknown }) {
  const text = (input: unknown, label: string, limit: number) => {
    if (input != null && typeof input !== 'string') throw Error(`${label} must be text.`)
    const result = String(input ?? '').trim()
    if (result.length > limit) throw Error(`${label} is too long (maximum ${limit} characters).`)
    return result
  }
  return { notes: text(value.notes, 'Customer notes', 5000),
    termsAndConditions: text(value.termsAndConditions, 'Terms and conditions', 10000) }
}

export function documentNoteLines(value: any): string[] {
  return [value?.notes ? `Customer notes: ${value.notes}` : '',
    value?.termsAndConditions ? `Terms and conditions: ${value.termsAndConditions}` : ''].filter(Boolean)
}
