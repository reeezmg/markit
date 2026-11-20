import type { Ref } from 'vue'

/** Document adapters supply their section arrays; mutations and guards live here. */
export function useDocumentSections<T extends { id: string }>(options: {
  sections: Readonly<Ref<T[]>>; selectedId: Ref<string>; locked: () => boolean;
  limit: number; minimum?: number; protected?: (section: T) => boolean;
}) {
  const selected = () => options.sections.value.find(s => s.id === options.selectedId.value)
  function move(id: string, offset: number) {
    const sections = options.sections.value, from = sections.findIndex(s => s.id === id), to = from + offset
    if (options.locked() || from < 0 || to < 0 || to >= sections.length) return
    sections.splice(to, 0, sections.splice(from, 1)[0])
  }
  function duplicate() {
    const section = selected(), sections = options.sections.value
    if (options.locked() || !section || options.protected?.(section) || sections.length >= options.limit) return
    const copy: T = JSON.parse(JSON.stringify(section)); copy.id = crypto.randomUUID()
    sections.splice(sections.indexOf(section) + 1, 0, copy); options.selectedId.value = copy.id
  }
  function remove() {
    const section = selected(), sections = options.sections.value
    if (options.locked() || !section || options.protected?.(section) || sections.length <= (options.minimum ?? 1)) return
    const index = sections.indexOf(section); sections.splice(index, 1)
    options.selectedId.value = sections[Math.min(index, sections.length - 1)]?.id || ''
  }
  function drop(id: string, target: string) {
    const sections = options.sections.value, from = sections.findIndex(s => s.id === id), to = sections.findIndex(s => s.id === target)
    if (from >= 0 && to >= 0) move(id, to - from)
  }
  return { move, duplicate, remove, drop }
}
