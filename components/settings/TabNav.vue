<template>
  <UHorizontalNavigation
    :links="[
      { label: 'General', to: '/settings', exact: true },
      { label: 'Store', to: '/settings/store' },
      { label: 'Printer', to: '/settings/printer' },
      { label: 'Numbering', to: '/settings/numbering' },
    ]"
    class="mb-6 border-b border-gray-200 dark:border-gray-700"
  />
</template>
