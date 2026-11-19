<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { sidebarSections, sidebarSectionLabels, sidebarPages, normalizeSidebarPreferences, type SidebarPreferences, type SidebarSection, type SidebarLink } from '../../utils/sidebar-navigation';
const props = defineProps<{ preferences: SidebarPreferences; menus: Record<SidebarSection, SidebarLink[]>; canManage: boolean; saving?: boolean }>();
const emit = defineEmits<{ save: [preferences: SidebarPreferences] }>();
const draft = ref(normalizeSidebarPreferences(props.preferences)), search = ref('');
watch(() => props.preferences, value => { draft.value = normalizeSidebarPreferences(value); });
const pages = computed(() => Object.fromEntries(sidebarSections.map(section => [section, [...new Map(sidebarPages(props.menus[section]).map(page => [page.key, page])).values()]])) as Record<SidebarSection, ReturnType<typeof sidebarPages>>);
const groups = (section: SidebarSection) => [...new Set(pages.value[section].map(page => page.group))].map(label => ({ label,
  pages: pages.value[section].filter(page => page.group === label && (!search.value || `${page.label} ${label}`.toLowerCase().includes(search.value.toLowerCase()))),
})).filter(group => group.pages.length);
const checked = (section: SidebarSection, key: string) => !draft.value.sections[section].hiddenPages.includes(key);
const selected = (section: SidebarSection) => pages.value[section].filter(page => checked(section, page.key)).length;
function selectPages(section: SidebarSection, keys: string[], enabled: boolean) {
  const hidden = new Set(draft.value.sections[section].hiddenPages);
  for (const key of keys) enabled ? hidden.delete(key) : hidden.add(key);
  draft.value.sections[section].hiddenPages = [...hidden];
}
function selectAll(enabled: boolean) { for (const section of sidebarSections) { draft.value.sections[section].enabled = enabled; if (enabled) draft.value.sections[section].hiddenPages = []; } }
const changed = computed(() => JSON.stringify(draft.value) !== JSON.stringify(props.preferences));
</script>
<template>
  <form class="space-y-6" @submit.prevent="emit('save', normalizeSidebarPreferences(draft))">
    <div class="flex flex-wrap items-start justify-between gap-4">
      <div><h1 class="text-xl font-semibold">Sidebar</h1><p class="mt-1 text-sm text-gray-500">Choose the sections and pages your company sees in the sidebar.</p></div>
      <button v-if="canManage" type="submit" class="rounded-lg bg-primary-500 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50" :disabled="saving || !changed">{{ saving ? 'Saving…' : 'Save sidebar' }}</button>
    </div>
    <p class="text-sm text-gray-500">Storetools contains your storefront and online store tools. Choices apply to this company. Each staff member continues to see pages allowed by their role, plan and enabled workflows. Settings stays available in the user menu.</p>
    <p v-if="!canManage" class="rounded-lg bg-gray-50 p-3 text-sm dark:bg-gray-800">An administrator or manager can change these settings.</p>
    <div class="flex flex-wrap items-center gap-3"><input v-model="search" type="search" aria-label="Find sidebar pages" placeholder="Find a page…" class="min-w-0 flex-1 rounded-lg border border-gray-300 bg-transparent px-3 py-2 text-sm dark:border-gray-700"/><button v-if="canManage" type="button" class="text-sm font-medium text-primary-600" :disabled="saving" @click="selectAll(true)">Show all</button><button v-if="canManage" type="button" class="text-sm font-medium text-gray-500" :disabled="saving" @click="selectAll(false)">Hide all</button></div>
    <fieldset :disabled="saving || !canManage" class="grid min-w-0 gap-5 lg:grid-cols-2">
      <section v-for="section in sidebarSections" :key="section" class="min-w-0 rounded-xl border border-gray-200 p-4 dark:border-gray-700" :aria-label="sidebarSectionLabels[section] + ' sidebar settings'">
        <div class="flex flex-wrap items-center justify-between gap-3"><label class="flex items-center gap-3 font-semibold"><input v-model="draft.sections[section].enabled" type="checkbox" class="h-4 w-4" :aria-label="'Show ' + sidebarSectionLabels[section] + ' section'"/>{{ sidebarSectionLabels[section] }}</label><span class="text-xs text-gray-500">{{ selected(section) }} / {{ pages[section].length }} pages selected</span></div>
        <p v-if="!pages[section].length" class="mt-4 text-sm text-gray-500">No pages are available for your current role, plan or workflows.</p>
        <template v-else><div class="my-3 flex gap-4"><button type="button" class="text-xs font-medium text-primary-600 disabled:opacity-50" :disabled="!draft.sections[section].enabled" @click="selectPages(section, pages[section].map(page => page.key), true)">Select all pages</button><button type="button" class="text-xs font-medium text-gray-500 disabled:opacity-50" :disabled="!draft.sections[section].enabled" @click="selectPages(section, pages[section].map(page => page.key), false)">Clear pages</button></div>
          <div v-for="group in groups(section)" :key="group.label" class="mb-4 last:mb-0"><label v-if="group.label" class="mb-2 flex items-center gap-2 border-t border-gray-100 pt-3 text-xs font-semibold uppercase text-gray-500 dark:border-gray-800"><input type="checkbox" :checked="group.pages.every(page => checked(section, page.key))" :indeterminate="group.pages.some(page => checked(section, page.key)) && !group.pages.every(page => checked(section, page.key))" :aria-label="'Select ' + sidebarSectionLabels[section] + ' ' + group.label + ' pages'" :disabled="!draft.sections[section].enabled" @change="selectPages(section, group.pages.map(page => page.key), ($event.target as HTMLInputElement).checked)"/>{{ group.label }}</label>
            <div class="grid gap-1 sm:grid-cols-2"><label v-for="page in group.pages" :key="page.key" class="flex items-start gap-2 rounded-md px-2 py-2 text-sm" :class="!draft.sections[section].enabled ? 'opacity-50' : 'hover:bg-gray-50 dark:hover:bg-gray-800'"><input type="checkbox" :checked="checked(section, page.key)" :disabled="!draft.sections[section].enabled" :aria-label="sidebarSectionLabels[section] + ': ' + (group.label ? group.label + ' / ' : '') + page.label" class="mt-0.5" @change="selectPages(section, [page.key], ($event.target as HTMLInputElement).checked)"/><span>{{ page.label }}</span></label></div>
          </div><p v-if="!groups(section).length" class="text-sm text-gray-500">No matching pages.</p>
        </template>
      </section>
    </fieldset>
    <p v-if="sidebarSections.every(section => !draft.sections[section].enabled || selected(section) === 0)" class="rounded-lg bg-gray-50 p-3 text-sm dark:bg-gray-800">No sidebar pages are selected. You can reopen Settings from your user menu to change this.</p>
    <div v-if="canManage" class="flex justify-end"><button type="submit" class="rounded-lg bg-primary-500 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50" :disabled="saving || !changed">{{ saving ? 'Saving…' : 'Save sidebar' }}</button></div>
  </form>
</template>
