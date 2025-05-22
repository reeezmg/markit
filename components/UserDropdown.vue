<script setup lang="ts">
const { isHelpSlideoverOpen } = useDashboard();
const { isDashboardSearchModalOpen } = useUIState();
const { metaSymbol } = useShortcuts();
const useAuth = () => useNuxtApp().$auth;
const { $client } = useNuxtApp()

const onLogout = async() => {
    await authLogout();
}

const items = computed(() => [
    [
        {
            slot: 'account',
            label: '',
            disabled: true,
        },
    ],
    [
        {
            label: 'Settings',
            icon: 'i-heroicons-cog-8-tooth',
            to: '/settings',
        },
        {
            label: 'Help & Support',
            icon: 'i-heroicons-question-mark-circle',
            shortcuts: ['?'],
            click: () => (isHelpSlideoverOpen.value = true),
        },
    ],
    [
        {
            label: 'Sign out',
            icon: 'i-heroicons-arrow-left-on-rectangle',
            click: async () => {
                onLogout()
            },
        },
    ],
]);
</script>

<template>
    <UDropdown
        mode="hover"
        :items="items"
        :ui="{ width: 'w-full', item: { disabled: 'cursor-text select-text' } }"
        :popper="{ strategy: 'absolute', placement: 'top' }"
        class="w-full"
    >
        <template #default="{ open }">
            <UButton
                color="gray"
                variant="ghost"
                class="w-full"
                :label="useAuth().session.value?.name"
                :class="[open && 'bg-gray-50 dark:bg-gray-800']"
            >
                <template #leading>
                    <UAvatar
                        :src="`https://unifeed.s3.ap-south-1.amazonaws.com/${useAuth().session.value?.image || ''}`" 
                        :alt="useAuth().session.value?.name"
                        size="2xs"
                    />
                </template>

                <template #trailing>
                    <UIcon
                        name="i-heroicons-ellipsis-vertical"
                        class="w-5 h-5 ml-auto"
                    />
                </template>
            </UButton>
        </template>

        <template #account>
            <div class="text-left">
                <p> Signed in as </p>
                <p class="truncate font-medium text-gray-900 dark:text-white">
                    {{ useAuth().session.value?.email }}
                </p>
            </div>
        </template>
    </UDropdown>
</template>
