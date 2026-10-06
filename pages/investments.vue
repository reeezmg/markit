<script setup lang="ts">
import { investmentPages } from '~/utils/investments';
definePageMeta({ auth: true });
const scope = useCompanyScope('form');
const route = useRoute();
if (typeof route.query.entryCompany === 'string')
    await scope.selectOwner(route.query.entryCompany);
const allowed = computed(() =>
    ['admin', 'manager', 'accountant'].includes(
        scope.auth.session.value?.role || ''
    )
);
const title = computed(
    () =>
        investmentPages.find(
            ([path]) => route.path === `/investments/${path}`
        )?.[1] || 'Investor account'
);
</script>
<template>
    <UDashboardPage
        ><UDashboardPanel grow>
            <UDashboardNavbar :title="`Investments · ${title}`" />
            <template v-if="allowed">
                <div
                    class="border-b border-gray-200 dark:border-gray-800 px-4 py-3 sm:px-6"
                    ><div class="max-w-sm"><CompanyFormField /></div
                ></div>
                <main class="flex-1 overflow-auto p-4 sm:p-6"
                    ><NuxtPage
                        :key="`${scope.companyId.value}:${route.fullPath}`"
                /></main>
            </template>
            <p v-else class="p-6"
                >Investments requires an admin, manager or accountant role.</p
            >
        </UDashboardPanel></UDashboardPage
    >
</template>
