<script setup lang="ts">
import { useMessaging } from '~/composables/useMessaging'
import { deleteToken,getToken } from 'firebase/messaging';

const { isHelpSlideoverOpen } = useDashboard();
const { isDashboardSearchModalOpen } = useUIState();
const { metaSymbol } = useShortcuts();
const useAuth = () => useNuxtApp().$auth;
const { $client } = useNuxtApp()
const messaging = await useMessaging()


const onLogout = async () => {
  try {
    // Retrieve the current token first
    console.log("heer")
    const currentToken = await getToken(messaging);
    if (currentToken) {
      const success = await deleteToken(messaging);
    }
  } catch (error) {
    console.error('Error deleting FCM token:', error);
  }

  await authLogout();
};

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
                        :src="`https://images.markit.co.in/${useAuth().session.value?.image || ''}`" 
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
