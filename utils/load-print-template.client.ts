import { activeTemplate, printSettingsSchema, type PrintSettings } from './print-templates';

// Bump once for the company-wide base-default rollout; older cached defaults are stale.
const PRINT_DESIGN_CACHE_PREFIX = 'markit-print-designs:v2:';

export function cachePrintSettings(companyId: string | undefined, settings: PrintSettings) {
  if (!companyId) return;
  const key = `${PRINT_DESIGN_CACHE_PREFIX}${companyId}`;
  const checked = printSettingsSchema.parse(settings);
  try {
    localStorage.setItem(key, JSON.stringify(checked));
  }
  catch {
    // A failed replacement must not leave the previous design selected locally.
    try { localStorage.removeItem(key); } catch { /* Storage unavailable. */ }
  }
  try { localStorage.removeItem?.(`markit-print-designs:${companyId}`); } catch { /* The new cache remains usable. */ }
}

// Company-scoped persistent cache; Settings refreshes it on load and successful save.
export async function loadPrintTemplate(kind: 'receipt' | 'label', companyId?: string) {
  const company = companyId || useNuxtApp().$auth.session.value?.companyId;
  if (!company) throw new Error('Select a company before printing.');
  let value: unknown = null;
  try { value = JSON.parse(localStorage.getItem(`${PRINT_DESIGN_CACHE_PREFIX}${company}`) || 'null'); } catch { /* Missing, blocked or invalid storage: fetch when online. */ }
  const cached = printSettingsSchema.safeParse(value);
  if (cached.success) return activeTemplate(cached.data, kind);
  if (!navigator.onLine) throw new Error('Connect to the internet once to load this company’s print designs.');
  const settings = printSettingsSchema.parse(await $fetch<PrintSettings>('/api/settings/print-templates', { query: { companyId: company } }));
  cachePrintSettings(company, settings);
  return activeTemplate(settings, kind);
}
