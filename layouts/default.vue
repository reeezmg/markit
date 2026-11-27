<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import { useDashboard } from '~/composables/useDashboard';
import { buildSidebarMenu } from '~/utils/sidebar-menu';
import { sidebarSections, sidebarSectionLabels, filterSidebarLinks, type SidebarSection, type SidebarLink } from '~/utils/sidebar-navigation';
import AiChatChatBox from '~/components/AiChat/ChatBox.vue';

const route = useRoute();
const useAuth = () => useNuxtApp().$auth;
const cleanupUnlocked = useState('cleanup-unlocked', () => false)
const showSidebar = computed(() =>
  route.path !== '/cleanup' || cleanupUnlocked.value
)   
const isSidebarCollapsed = ref(false)
// Keep section choices through layout remounts, independently for each company.
const selectedSections = useState<Record<string, SidebarSection>>('sidebar-selected-sections', () => ({}))
const sidebarSection = computed({
  get: () => selectedSections.value[auth.session.value?.companyId || ''] || 'erp',
  set: (section: SidebarSection) => { selectedSections.value[auth.session.value?.companyId || ''] = section },
})
const sectionLabel = (section:SidebarSection) => sidebarSectionLabels[section]
const sectionIcon = (section:string) => (({erp:'i-heroicons-credit-card',crm:'i-heroicons-user-group',storefront:'i-heroicons-globe-alt',connect:'i-heroicons-link'} as Record<string,string>)[section] || 'i-heroicons-squares-2x2')


const { isHelpSlideoverOpen } = useDashboard();

const auth = useAuth();
const salesWorkflow = useSalesWorkflow(computed(() => auth.session.value?.companyId || ''));
const sidebarPreferences = useSidebarPreferences(computed(() => auth.session.value?.companyId || ''));
await sidebarPreferences.ready;

onMounted(() => {
  const saved = localStorage.getItem('storetools_sidebar_collapsed')
  isSidebarCollapsed.value = saved === 'true'
})

watch(isSidebarCollapsed, (collapsed) => {
  localStorage.setItem('storetools_sidebar_collapsed', String(collapsed))
})

const toggleSidebar = () => {
  isSidebarCollapsed.value = !isSidebarCollapsed.value
}




const menus = computed(() => Object.fromEntries(sidebarSections.map(section => [section, buildSidebarMenu(section, auth.session.value || {}, salesWorkflow.preferences.value)])) as Record<SidebarSection, SidebarLink[]>);
const visibleMenus = computed(() => Object.fromEntries(sidebarSections.map(section => [section, filterSidebarLinks(menus.value[section], section, sidebarPreferences.preferences.value)])) as Record<SidebarSection, SidebarLink[]>);
const links = computed(() => visibleMenus.value[sidebarSection.value]);

const availableSections = computed(() => sidebarSections.filter(section => visibleMenus.value[section].length));
const onSectionKeydown = (event: KeyboardEvent, section: SidebarSection) => {
  const arrows = isSidebarCollapsed.value ? ['ArrowUp', 'ArrowDown'] : ['ArrowLeft', 'ArrowRight'];
  const current = availableSections.value.indexOf(section);
  const next = event.key === 'Home' ? 0 : event.key === 'End' ? availableSections.value.length - 1
    : event.key === arrows[0] ? (current - 1 + availableSections.value.length) % availableSections.value.length
    : event.key === arrows[1] ? (current + 1) % availableSections.value.length : -1;
  if (next < 0) return;
  event.preventDefault();
  sidebarSection.value = availableSections.value[next];
  (event.currentTarget as HTMLElement).closest('[role="tablist"]')?.querySelectorAll<HTMLElement>('[role="tab"]')[next]?.focus();
};
watch(() => [route.path, route.query.from, auth.session.value?.companyId, availableSections.value.join(',')] as const, ([path, from, company], previous) => {
  // Preference refreshes must not undo an explicit section choice on the same page.
  const routeChanged = !previous || path !== previous[0] || from !== previous[1] || company !== previous[2];
  const matchesRoute = (items: SidebarLink[]): boolean => items.some(link => {
    if (link.children?.length && matchesRoute(link.children)) return true;
    if (!link.to) return false;
    const target = new URL(link.to, 'https://markit.local');
    return (path === target.pathname || path.startsWith(`${target.pathname}/`)) &&
      [...target.searchParams].every(([key, value]) => route.query[key] === value);
  });
  const desired: SidebarSection = path.startsWith('/crm') || path === '/client' && route.query.from === 'crm' ? 'crm'
    : path.startsWith('/connect') ? 'connect' : path.startsWith('/storefront/') || path.startsWith('/ecommerce-cms/') || path.startsWith('/ai/') ? 'storefront' : 'erp';
  // Shared destinations (orders, Settings) keep their originating section.
  const currentMatches = matchesRoute(visibleMenus.value[sidebarSection.value]);
  if (routeChanged && !path.startsWith('/settings') && (desired !== 'erp' || !currentMatches) && availableSections.value.includes(desired)) sidebarSection.value=desired;
  else if (!availableSections.value.includes(sidebarSection.value)) sidebarSection.value=availableSections.value[0] || 'erp';
}, {immediate:true});

const footerLinks = [
   
    {
        label: 'Help & Support',
        icon: 'i-heroicons-question-mark-circle',
        click: () => (isHelpSlideoverOpen.value = true),
    },
];

const isRouteActive = (to?: string) => {
  if (!to) return false
  const target = new URL(to, 'https://markit.local')
  return (route.path === target.pathname || route.path.startsWith(`${target.pathname}/`)) &&
    [...target.searchParams].every(([key, value]) => route.query[key] === value)
}

</script>

<template>
    <UDashboardLayout>
        <UDashboardPanel
            v-if="showSidebar && !isSidebarCollapsed"
            :width="250"
            :resizable="{ min: 200, max: 300 }"
            collapsible
        >
            <UDashboardNavbar
                class="!border-transparent"
                :ui="{ left: 'flex-1' }"
            >
                <template #left>
                    <TeamsDropdown />
                </template>
                <template #right>
                    <UButton
                        icon="i-heroicons-chevron-double-left"
                        aria-label="Collapse sidebar"
                        color="gray"
                        variant="ghost"
                        @click="toggleSidebar"
                    />
                </template>
            </UDashboardNavbar>

            <UDashboardSidebar>
                <template v-if="availableSections.length > 1" #header>
                    <div class="flex w-full items-center gap-0.5" role="tablist" aria-label="Sidebar section" aria-orientation="horizontal">
                        <UTooltip v-for="section in availableSections" :key="section" :text="sectionLabel(section)">
                            <button
                                type="button"
                                role="tab"
                                :aria-label="sectionLabel(section)"
                                :aria-selected="sidebarSection === section"
                                :tabindex="sidebarSection === section ? 0 : -1"
                                :class="[
                                    'flex h-10 w-10 shrink-0 items-center justify-center border-b-2 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2',
                                    sidebarSection === section
                                        ? 'border-primary-500 text-primary-500'
                                        : 'border-transparent text-gray-400 hover:text-gray-700 dark:text-gray-500 dark:hover:text-gray-200',
                                ]"
                                @click="sidebarSection = section"
                                @keydown="onSectionKeydown($event, section)"
                            >
                                <UIcon :name="sectionIcon(section)" class="h-5 w-5" />
                            </button>
                        </UTooltip>
                    </div>
                </template>

                <p v-if="!availableSections.length" class="px-3 py-4 text-sm text-gray-500">No sidebar pages selected. Open Settings from your user menu to choose pages.</p>
                <div class="space-y-1">
                  <template v-for="link in links" :key="link.id || link.label">
                    <AccountantSidebarNavigation v-if="link.id === 'accountant'" :allowed-paths="link.children?.map(child => child.to)" />
                    <UDashboardSidebarLinks v-else :links="[link]" />
                  </template>
                </div>

                <UDivider />

                <div class="flex-1" />

                <UDivider class="sticky bottom-0" />

                <template #footer>
                    <UserDropdown />
                </template>
            </UDashboardSidebar>
        </UDashboardPanel>

        <UDashboardPanel
          v-else-if="showSidebar && isSidebarCollapsed"
          :width="64"
        >
          <UDashboardNavbar class="!border-transparent" :ui="{ left: 'justify-center' }">
            <template #left>
              <UButton
                icon="i-heroicons-chevron-double-right"
                aria-label="Expand sidebar"
                color="gray"
                variant="ghost"
                @click="toggleSidebar"
              />
            </template>
          </UDashboardNavbar>

          <UDashboardSidebar :ui="{ header: 'px-1', body: 'px-1', footer: 'px-1' }">
            <template v-if="availableSections.length > 1" #header>
              <div class="mx-auto flex w-12 shrink-0 flex-col items-center gap-1 p-0.5" role="tablist" aria-label="Sidebar section" aria-orientation="vertical">
                <UTooltip v-for="section in availableSections" :key="section" :text="sectionLabel(section)">
                  <button
                    type="button"
                    :aria-label="sectionLabel(section)"
                    :tabindex="sidebarSection === section ? 0 : -1"
                    :class="[
                      'flex h-10 w-10 items-center justify-center border-l-2 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2',
                      sidebarSection === section
                        ? 'border-primary-500 text-primary-500'
                        : 'border-transparent text-gray-400 hover:text-gray-700 dark:text-gray-500 dark:hover:text-gray-200',
                    ]"
                    role="tab"
                    :aria-selected="sidebarSection === section"
                    @click="sidebarSection = section"
                    @keydown="onSectionKeydown($event, section)"
                  >
                    <UIcon :name="sectionIcon(section)" class="h-5 w-5" />
                  </button>
                </UTooltip>
              </div>
            </template>

            <UDivider />

            <div class="flex flex-col items-center gap-2 py-2">
              <template v-for="link in links" :key="link.id || link.label">
                <UPopover
                  v-if="'children' in link && link.children?.length"
                  mode="hover"
                  :popper="{ placement: 'right-start', strategy: 'fixed' }"
                >
                  <UButton
                    :icon="link.icon || 'i-heroicons-squares-2x2'"
                    color="gray"
                    :variant="(link.id === 'accountant' ? isRouteActive('/accountant') : isRouteActive(link.to)) ? 'soft' : 'ghost'"
                    :aria-label="link.label"
                    class="w-10 h-10 justify-center"
                  />

                  <template #panel>
                    <div v-if="link.id === 'accountant'" class="w-64 max-h-[70vh] overflow-y-auto p-3">
                      <AccountantSidebarNavigation compact :allowed-paths="link.children?.map(child => child.to)" />
                    </div>
                    <div v-else class="w-60 p-2">
                      <div class="text-sm font-medium px-2 py-1">{{ link.label }}</div>
                      <div class="space-y-1">
                        <NuxtLink
                          v-for="child in ('children' in link ? link.children : [])"
                          :key="child.to || child.label"
                          :to="child.to"
                          class="block px-2 py-1.5 rounded text-sm hover:bg-gray-100 dark:hover:bg-gray-800"
                        >
                          {{ child.label }}
                        </NuxtLink>
                      </div>
                    </div>
                  </template>
                </UPopover>

                <UTooltip v-else :text="link.label">
                  <UButton
                    :to="link.to"
                    :icon="link.icon || 'i-heroicons-squares-2x2'"
                    color="gray"
                    :variant="isRouteActive(link.to) ? 'soft' : 'ghost'"
                    class="w-10 h-10 justify-center"
                  />
                </UTooltip>
              </template>
            </div>

            <div class="flex-1" />

            <div class="pb-2 flex justify-center">
              <UserDropdown compact />
            </div>
          </UDashboardSidebar>
        </UDashboardPanel>

        <slot />

        <HelpSlideover />
        <NotificationsSlideover />
        <AiChatChatBox />
        

    </UDashboardLayout>
</template>
