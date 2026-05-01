<script setup lang="ts">
import { useMessaging } from '~/composables/useMessaging'
import { deleteToken, getToken } from 'firebase/messaging';
import { Capacitor } from '@capacitor/core';

const { isHelpSlideoverOpen, isChatSlideoverOpen } = useDashboard();
const { isDashboardSearchModalOpen } = useUIState();
const { metaSymbol } = useShortcuts();
const useAuth = () => useNuxtApp().$auth;
const { $client } = useNuxtApp();
const props = withDefaults(defineProps<{
  compact?: boolean
}>(), {
  compact: false,
})

const dropdownUi = computed(() => (
  props.compact
    ? { width: 'w-56', item: { disabled: 'cursor-text select-text' } }
    : { width: 'w-full', item: { disabled: 'cursor-text select-text' } }
))

const dropdownPopper = computed(() => (
  props.compact
    ? { strategy: 'fixed', placement: 'right-start' as const }
    : { strategy: 'absolute', placement: 'top' as const }
))

let messaging;
if (!Capacitor.isNativePlatform()) {
  messaging = await useMessaging();
}

const onLogout = async () => {
  try {
    // Only run Firebase messaging in the browser
    if (!Capacitor.isNativePlatform() && messaging) {
      console.log("Deleting FCM token in browser...");
      const currentToken = await getToken(messaging);
      if (currentToken) {
        await deleteToken(messaging);
        console.log("FCM token deleted.");
      }
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
      label: 'AI Chat',
      icon: 'i-heroicons-chat-bubble-left-ellipsis',
      click: () => (isChatSlideoverOpen.value = true),
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
        onLogout();
      },
    },
  ],
]);
</script>


<template>
    <UDropdown
        :mode="props.compact ? 'hover' : 'click'"
        :items="items"
        :ui="dropdownUi"
        :popper="dropdownPopper"
        :class="props.compact ? '' : 'w-full'"
    >
        <template #default="{ open }">
            <UButton
                color="gray"
                variant="ghost"
                :class="[
                  props.compact ? 'w-10 h-10 justify-center px-0' : 'w-full',
                  open && 'bg-gray-50 dark:bg-gray-800'
                ]"
                :label="props.compact ? undefined : useAuth().session.value?.name"
            >
                <template v-if="!props.compact" #leading>
                    <UAvatar
                        :src="`https://images.markit.co.in/${useAuth().session.value?.image}`" 
                        :alt="useAuth().session.value?.name!"
                        size="2xs"
                    />
                </template>

                <template #trailing>
                    <UIcon
                        :name="props.compact ? 'i-heroicons-ellipsis-horizontal' : 'i-heroicons-ellipsis-vertical'"
                        :class="props.compact ? 'w-5 h-5' : 'w-5 h-5 ml-auto'"
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
