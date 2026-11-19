export const sidebarSections = ['erp', 'crm', 'storefront', 'connect'] as const;
export type SidebarSection = typeof sidebarSections[number];
export const sidebarSectionLabels: Record<SidebarSection, string> = { erp: 'ERP', crm: 'CRM', storefront: 'Storetools', connect: 'Connect' };
export type SidebarLink = { id?: string; label: string; to?: string; children?: SidebarLink[]; [key: string]: any };
export type SidebarPreferences = { version: 1; revision: number; sections: Record<SidebarSection, { enabled: boolean; hiddenPages: string[] }> };
export function defaultSidebarPreferences(): SidebarPreferences {
  const sections = {} as SidebarPreferences['sections'];
  for (const key of sidebarSections) sections[key] = { enabled: key === 'erp', hiddenPages: [] };
  return { version: 1, revision: 0, sections };
}
export function sidebarPageKey(to: string): string {
  if (typeof to !== 'string' || !to.startsWith('/') || to.startsWith('//') || /[\s\\#]/.test(to) || to.length > 400) throw Error('Choose a valid sidebar page.');
  const url = new URL(to, 'https://markit.local');
  if (url.origin !== 'https://markit.local' || url.pathname.split('/').some(part => decodeURIComponent(part) === '..')) throw Error('Choose a valid sidebar page.');
  // entryCompany is request context, never part of a company's page selection.
  url.searchParams.delete('entryCompany'); url.searchParams.sort();
  return url.pathname.replace(/\/$/, '') + (url.searchParams.size ? '?' + url.searchParams.toString() : '') || '/';
}
export function normalizeSidebarPreferences(value: any, strict = false): SidebarPreferences {
  const result = defaultSidebarPreferences();
  if (value == null && !strict) return result;
  if (!value || typeof value !== 'object' || Array.isArray(value) || value.version !== 1 || !value.sections || typeof value.sections !== 'object' || Array.isArray(value.sections)) throw Error('Choose valid sidebar sections and pages.');
  if (strict && (Object.keys(value).some(key => !['version', 'revision', 'sections'].includes(key)) || Object.keys(value.sections).some(key => !sidebarSections.includes(key as SidebarSection)))) throw Error('Choose valid sidebar sections and pages.');
  if (!Number.isSafeInteger(value.revision) || value.revision < 0) throw Error('Reload sidebar settings before saving.');
  result.revision = value.revision;
  for (const key of sidebarSections) {
    const section = value.sections[key];
    if (!section || typeof section.enabled !== 'boolean' || !Array.isArray(section.hiddenPages) || section.hiddenPages.length > 1000 || strict && Object.keys(section).some(key => !['enabled', 'hiddenPages'].includes(key))) throw Error('Choose valid sidebar sections and pages.');
    result.sections[key] = { enabled: section.enabled, hiddenPages: [...new Set<string>(section.hiddenPages.map((page: unknown) => sidebarPageKey(page as string)))] };
  }
  return result;
}
export function sidebarPages(links: SidebarLink[], group = ''): { key: string; label: string; group: string }[] {
  return links.flatMap(link => link.children?.length ? sidebarPages(link.children, group ? group + ' / ' + link.label : link.label) : link.to ? [{ key: sidebarPageKey(link.to), label: link.label, group }] : []);
}
export function filterSidebarLinks(links: SidebarLink[], section: SidebarSection, preferences: SidebarPreferences): SidebarLink[] {
  if (!preferences.sections[section].enabled) return [];
  const hidden = new Set(preferences.sections[section].hiddenPages);
  const filter = (links: SidebarLink[]): SidebarLink[] => links.flatMap(link => {
    if (link.children) {
      const children = filter(link.children);
      if (!children.length) return [];
      const restricted = sidebarPages(link.children).some(page => hidden.has(page.key));
      return [{ ...link, children, ...(link.to && restricted ? { to: children.some(child => child.to === link.to) ? link.to : children[0].to } : {}) }];
    }
    return link.to && !hidden.has(sidebarPageKey(link.to)) ? [{ ...link }] : [];
  });
  return filter(links);
}
