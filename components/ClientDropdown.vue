<script setup lang="ts">
const { isHelpSlideoverOpen } = useDashboard();
const { isDashboardSearchModalOpen } = useUIState();
const { metaSymbol } = useShortcuts();
const useClientAuth = () => useNuxtApp().$authClient;
const { $client } = useNuxtApp()
const cartStore = useCartStore();
const isAvatarModalOpen = ref(false);

// List of different DiceBear styles
const avatarStyles = [
  'initials', 'personas', 'bottts', 'avataaars', 'micah', 
  'pixel-art', 'identicon', 'adventurer', 'big-ears'
];

// Generate random avatar based on user's name
const userAvatar = computed(() => {
  const session = useClientAuth().session.value;
  if (!session?.name) return 'https://api.dicebear.com/7.x/initials/svg?seed=User';
  
  const randomStyle = avatarStyles[Math.floor(Math.random() * avatarStyles.length)];
  const name = session.name.replace(/\s+/g, '-');
  return `https://api.dicebear.com/7.x/${randomStyle}/svg?seed=${name}&backgroundType=gradientLinear`;
});

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
            label: 'View Profile',
            icon: 'i-heroicons-user-circle',
            click: () => isAvatarModalOpen.value = true
        },
        {
            label: 'Help & Support',
            icon: 'i-heroicons-question-mark-circle-20-solid',
            iconClass: 'w-5 h-5',
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
            iconClass: 'w-5 h-5',
            click: async (): Promise<void> => {
                await onLogout();
            },
        },
    ],
]);
</script>

<template>
    <div>
        <UDropdown
            mode="click"
            :items="items"
            :ui="{ 
                width: 'w-64',
                item: { 
                    disabled: 'cursor-text select-text',
                    active: 'text-primary-500 dark:text-primary-400',
                    icon: {
                        base: 'flex-shrink-0'
                    }
                } 
            }"
            :popper="{ strategy: 'absolute', placement: 'top' }"
        >
            <template #default="{ open }">
                <UButton
                    color="gray"
                    variant="ghost"
                    class="w-full hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                    :label="useClientAuth().session.value?.name"
                    :class="[open && 'bg-gray-50 dark:bg-gray-800']"
                >
                    <template #leading>
                        <UAvatar
                            :src="userAvatar"
                            :alt="useClientAuth().session.value?.name || 'User'"
                            size="xs"
                            class="ring-2 ring-primary-500 dark:ring-primary-400"
                        />
                    </template>

                    <template #trailing>
                        <UIcon
                            name="i-heroicons-chevron-down"
                            class="w-4 h-4 ml-1 transition-transform duration-200"
                            :class="[open && 'transform rotate-180']"
                        />
                    </template>
                </UButton>
            </template>

            <template #account>
                <div class="text-left p-3">
                    <div class="flex items-center gap-3 mb-2">
                        <UAvatar
                            :src="userAvatar"
                            :alt="useClientAuth().session.value?.name || 'User'"
                            size="lg"
                            class="ring-2 ring-primary-500 dark:ring-primary-400 cursor-pointer hover:scale-105 transition-transform"
                            @click="isAvatarModalOpen = true"
                        />
                        <div>
                            <p class="text-xs text-gray-500 dark:text-gray-400">Signed in as</p>
                            <p class="truncate font-medium text-gray-900 dark:text-white">
                                {{ useClientAuth().session.value?.name }}
                            </p>
                            <p class="truncate text-sm text-gray-500 dark:text-gray-400">
                                {{ useClientAuth().session.value?.phone }}
                            </p>
                        </div>
                    </div>
                </div>
            </template>
        </UDropdown>

        <!-- Avatar Modal -->
        <UModal v-model="isAvatarModalOpen">
            <UCard>
                <template #header>
                    <div class="text-center">
                        <h2 class="text-xl font-semibold">Your Profile</h2>
                    </div>
                </template>

                <div class="flex flex-col items-center gap-4 p-4">
                    <UAvatar
                        :src="userAvatar"
                        :alt="useClientAuth().session.value?.name || 'User'"
                        size="3xl"
                        class="ring-4 ring-primary-500 dark:ring-primary-400 hover:scale-110 transition-transform cursor-pointer"
                        @click="isAvatarModalOpen = false"
                    />
                    <div class="text-center">
                        <h3 class="text-lg font-medium text-gray-900 dark:text-white">
                            {{ useClientAuth().session.value?.name }}
                        </h3>
                        <p class="text-gray-500 dark:text-gray-400">
                            {{ useClientAuth().session.value?.phone }}
                        </p>
                    </div>
                </div>

                <template #footer>
                    <div class="flex justify-center gap-3">
                        <UButton
                            color="primary"
                            label="Close"
                            @click="isAvatarModalOpen = false"
                        />
                    </div>
                </template>
            </UCard>
        </UModal>
    </div>
</template>