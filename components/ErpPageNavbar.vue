<script setup lang="ts">
defineOptions({ inheritAttrs: false });
defineProps<{ title?: string }>();
</script>

<template>
  <UDashboardNavbar v-bind="$attrs" :title="title" :ui="{ right: 'items-center' }">
    <template #right>
      <slot name="right" />
      <div id="company-page-topbar" class="empty:hidden flex min-w-0 gap-3 [&>div]:w-40 sm:[&>div]:w-44 [&_*]:!mb-0" aria-label="Page company scope" />
    </template>
    <template v-for="name in Object.keys($slots).filter(name => name !== 'right')" #[name]="slotProps">
      <slot :name="name" v-bind="slotProps || {}" />
    </template>
  </UDashboardNavbar>
</template>

<style>
/* Tabs can keep several copies of a selector mounted for the same page scope.
   Display one copy of each existing purpose without combining their state. */
#company-page-topbar > [data-company-control="table"] ~ [data-company-control="table"],
#company-page-topbar > [data-company-control="form"] ~ [data-company-control="form"] {
  display: none;
}
</style>
