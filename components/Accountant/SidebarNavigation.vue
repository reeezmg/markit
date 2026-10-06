<script setup lang="ts">
import { accountantSections } from '~/utils/accountant-navigation';

defineProps<{ compact?: boolean }>();
const route = useRoute();
const open = ref(route.path.startsWith('/accountant'));
const active = (path: string) => route.path === `/accountant/${path}` || route.path.startsWith(`/accountant/${path}/`);
const sectionOpen = ref<Record<string, boolean>>(Object.fromEntries(
  accountantSections.map(section => [section.label, section.links.some(([path]) => active(path))]),
));
const sectionId = (label: string) => `account-navigation-${label.toLowerCase().replaceAll(' ', '-')}`;
watch(() => route.path, (path) => {
  if (path === '/accountant' || path.startsWith('/accountant/')) open.value = true;
  for (const section of accountantSections) {
    if (section.links.some(([page]) => active(page))) sectionOpen.value[section.label] = true;
  }
});
</script>

<template>
  <component :is="compact ? 'div' : 'details'" :open="open" @toggle="open = $event.target.open">
    <summary v-if="!compact" class="flex cursor-pointer list-none items-center gap-2 rounded-md px-2.5 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-100 dark:text-gray-200 dark:hover:bg-gray-800 [&::-webkit-details-marker]:hidden" :class="route.path.startsWith('/accountant') ? 'bg-gray-100 dark:bg-gray-800' : ''">
      <UIcon name="i-heroicons-book-open" class="h-4 w-4 shrink-0" />
      <span class="flex-1">Account</span>
      <UIcon name="i-heroicons-chevron-right" class="h-4 w-4 transition-transform" :class="open ? 'rotate-90' : ''" />
    </summary>
    <h2 v-else class="px-2 pb-3 text-sm font-semibold">Account</h2>
    <nav aria-label="Account navigation" class="space-y-1 py-3" :class="compact ? '' : 'ml-4 border-l border-gray-200 pl-2 dark:border-gray-800'">
      <section v-for="section in accountantSections" :key="section.label">
        <h3>
          <button type="button" class="flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-xs font-semibold uppercase text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800"
            :aria-expanded="sectionOpen[section.label]" :aria-controls="sectionId(section.label)" @click="sectionOpen[section.label] = !sectionOpen[section.label]">
            <span class="flex-1">{{ section.label }}</span>
            <UIcon name="i-heroicons-chevron-right" class="h-3.5 w-3.5 shrink-0 transition-transform" :class="sectionOpen[section.label] ? 'rotate-90' : ''" />
          </button>
        </h3>
        <div v-show="sectionOpen[section.label]" :id="sectionId(section.label)" class="pb-2">
        <NuxtLink v-for="[path, label] in section.links" :key="path" :to="`/accountant/${path}`" :aria-current="active(path) ? 'page' : undefined"
          class="block rounded-md px-2 py-1.5 text-sm transition-colors"
          :class="active(path) ? 'bg-primary-50 font-medium text-primary-700 dark:bg-primary-950 dark:text-primary-300' : 'text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800'">
          {{ label }}
        </NuxtLink>
        </div>
      </section>
    </nav>
  </component>
</template>
