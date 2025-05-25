<script setup lang="ts">
const { isHelpSlideoverOpen } = useDashboard();
const { isDashboardSearchModalOpen } = useUIState();
const { metaSymbol } = useShortcuts();
const useClientAuth = () => useNuxtApp().$authClient;
const { $client } = useNuxtApp()
const cartStore = useCartStore();

const onLogout = async(): Promise<void> => {
    await authClientLogout();
    cartStore.clearCart();
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
            label: 'Help & Support',
            icon: 'i-heroicons-question-mark-circle',
            shortcuts: ['?'],
            click: (): void => {
                isHelpSlideoverOpen.value = true;
            },
        },
    ],
    [
        {
            label: 'Sign out',
            icon: 'i-heroicons-arrow-left-on-rectangle',
            click: async (): Promise<void> => {
                await onLogout();
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
                :label="useClientAuth().session.value?.name"
                :class="[open && 'bg-gray-50 dark:bg-gray-800']"
            >
                <template #leading>
                    <UAvatar
                        src="https://avatars.githubusercontent.com/u/739984?v=4"
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
                <p> Signed in with </p>
                <p class="truncate font-medium text-gray-900 dark:text-white">
                    {{ useClientAuth().session.value?.phone }}
                </p>
            </div>
        </template>
    </UDropdown>
</template>