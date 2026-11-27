import type { PrintSettings } from '~/utils/print-templates'
export interface PrintDesignDraft { settings: PrintSettings; saved: string; selectedId: string; returnTo: string }
export const usePrintDesignDraft = () => useState<Record<string, PrintDesignDraft>>('printer-design-drafts', () => ({}))
