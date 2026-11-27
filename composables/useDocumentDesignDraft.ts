import type { QuotePreferences } from '~/utils/quote-preferences'

export type DocumentDesignKind = 'quote' | 'sales-order'
export interface DocumentDesignDraft {
  preferences: QuotePreferences
  savedDesign: string
  returnTo: string
}

/** Company-scoped drafts survive SPA navigation between preferences and the designer. */
export function useDocumentDesignDraft() {
  return useState<Record<string, DocumentDesignDraft>>('erp-document-design-drafts', () => ({}))
}
export const documentDesignDraftKey = (companyId: string, kind: DocumentDesignKind) => `${kind}:${companyId}`
