export const billSaveActionIcons = {
  print: 'i-heroicons-printer',
  send: 'i-heroicons-paper-airplane',
  download: 'i-heroicons-arrow-down-tray',
  none: 'i-heroicons-check',
} as const;

export function billSaveActionIcon(action: string | null | undefined) {
  return billSaveActionIcons[action as keyof typeof billSaveActionIcons] || billSaveActionIcons.none;
}
