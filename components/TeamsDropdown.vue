<script setup lang="ts">
import { useFindUniqueUser } from '~/lib/hooks';
const useAuth = () => useNuxtApp().$auth;
const router = useRouter();
const { data: user }: any = useFindUniqueUser({
    where: { id: useAuth().session.value?.id },
    include: {
        companies: {
            include: {
                company: true,
            },
        },
    },
});

const isOpen = ref(false);
const companies = ref([]);
const activeCompany = ref([
    {
        company: {
            name: 'defult',
        },
    },
]);

watchEffect(() => {
    if (user.value) {
        companies.value = user.value.companies.map((item) => item.company);
        console.log(user.value.companies.map((item) => item.company));
        activeCompany.value = user.value.companies.filter(
            (item) => item.company.id === useAuth().session.value?.companyId,
        );
        console.log(user.value.companies[0]);
    }
});

const teams = (items) =>
    items.map((item) => ({
        label: item.name,
        avatar: {
            src: '',
        },
        click: async () => {
            await updateCompanySession(item.id, item.type, item.name);
            router.push(`/${item.id}`);
        },
    }));

const actions = computed(() => {
    const baseActions = [
        ...(useAuth().session.value?.role === 'admin'
            ? [
                  {
                      label: 'Create company',
                      icon: 'i-heroicons-plus-circle',
                      click: () => {
                          isOpen.value = true;
                      },
                  },
              ]
            : []),
    ];
    return baseActions;
});
</script>

<template>
    <UDropdown
        v-slot="{ open }"
        mode="hover"
        :items="[teams(companies), actions]"
        class="w-full"
        :ui="{ width: 'w-full' }"
        :popper="{ strategy: 'absolute' }"
    >
        <UButton
            color="gray"
            variant="ghost"
            :class="[open && 'bg-gray-50 dark:bg-gray-800']"
            class="w-full"
        >
            <!-- <UAvatar :src="team.avatar.src" size="2xs" /> -->

            <span
                class="truncate text-gray-900 dark:text-white font-semibold"
                >{{ activeCompany[0]?.company?.name }}</span
            >
        </UButton>
    </UDropdown>

    <CreateCompany
        :isOpen="isOpen"
        @update:isOpen="(value) => (isOpen = value)"
    />
</template>
