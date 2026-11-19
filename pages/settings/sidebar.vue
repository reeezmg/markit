<script setup lang="ts">
import { computed, ref, onBeforeUnmount } from 'vue';
import SidebarPreferencesEditor from '../../components/settings/SidebarPreferences.vue';
import { buildSidebarMenu } from '../../utils/sidebar-menu';
import { sidebarSections, type SidebarSection, type SidebarLink, type SidebarPreferences } from '../../utils/sidebar-navigation';
const company = await useSettingsCompany();
const preferences = useSidebarPreferences(company.scope.companyId, company.fetch);
const workflow = useSalesWorkflow(company.scope.companyId, company.fetch);
await Promise.all([preferences.ready, workflow.ready]);
const menus = computed(() => Object.fromEntries(sidebarSections.map(section => [section, buildSidebarMenu(section, company.auth.session.value || {}, workflow.preferences.value)])) as Record<SidebarSection, SidebarLink[]>);
const saving = ref(false), error = ref(''), notice = ref('');
async function save(value: SidebarPreferences) {
  if (saving.value) return;
  saving.value = true; company.scope.busy.value = true; error.value = ''; notice.value = '';
  try { await preferences.save(value); notice.value = 'Sidebar saved for this company.'; }
  catch (e: any) { error.value = e.data?.statusMessage || e.message || 'Could not save sidebar settings.'; }
  finally { saving.value = false; company.scope.busy.value = false; }
}
onBeforeUnmount(() => { company.scope.busy.value = false; });
</script>
<template><UDashboardPanelContent class="pb-24">
  <p v-if="error || preferences.error.value || workflow.error.value" role="alert" class="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950">{{ error || preferences.error.value || workflow.error.value }}</p>
  <p v-if="notice" role="status" class="mb-4 rounded-lg bg-green-50 p-3 text-sm text-green-700 dark:bg-green-950">{{ notice }}</p>
  <div v-if="preferences.error.value || workflow.error.value" class="space-y-3"><p>Load the current settings before making changes.</p><UButton color="gray" @click="preferences.load(); workflow.load()">Reload settings</UButton></div>
  <SidebarPreferencesEditor v-else :preferences="preferences.preferences.value" :menus="menus" :can-manage="preferences.canManage.value" :saving="saving" @save="save"/>
  <UButton v-if="error" class="mt-3" color="gray" :disabled="saving" @click="preferences.load(); error=''">Reload saved settings</UButton>
</UDashboardPanelContent></template>
