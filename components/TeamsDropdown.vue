<script setup lang="ts">
import { useFindUniqueUser } from '~/lib/hooks';
import { SplashScreen } from '@capacitor/splash-screen';
import { Capacitor } from '@capacitor/core'
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

watch(user, (newUser) => {
   console.log('User data updated:', newUser);
   console.log('Active company ID:', useAuth().session.value?.id);
}, { immediate: true });

const isOpen = ref(false);
const companies = ref([]);
const activeCompany = ref([
    {
        company: {
            name: 'defult',
            logo:''
        },
    },
]);

watch(user, (newUser) => {
  if (newUser) {
    companies.value = newUser.companies.map((item) => item);
    activeCompany.value = newUser.companies.filter(
      (item) => item.company.id === useAuth().session.value?.companyId
    );
  }
}, { immediate: true });

const teams = (items) =>
    items.map((item) => ({
        label: item.company.name,
        avatar: {
            src:`https://images.markit.co.in/${item.company.logo}` ,
        },
       click: async () => {
       await updateCompanySession(
        item.id,
        item.cleanup || false,
        item.name || null,
        item.company.description ?? undefined,
        item.company.thankYouNote ?? undefined,
        item.company.refundPolicy ?? undefined,
        item.company.returnPolicy ?? undefined,
        item.company.phone ?? undefined,
        item.image || null,
        item.code ?? undefined,
        item.company.storeUniqueName ?? undefined,
        item.company.isTaxIncluded,
        item.company.isBarcodeIncluded,
        item.company.isUserTrackIncluded,
        item.companyId,
        item.company.type,
        item.company.name,
        item.company.pipeline?.id,
        item.role,
        item.company.pointsValue || 0,
        item.company.currency || 'INR',
        'USER',
        item.company.address || {},
        item.company.gstin || '',
        item.company.accHolderName || '',
        item.company.upiId || '',
        item.company.plan,
        item.company.logo,
        (({ name, brand, category, subcategory, description }) =>
            ({ name, brand, category, subcategory, description })
        )(item.company.productinput || {}),
        (({ name, code, sprice, pprice, dprice, discount, qty, sizes, images }) =>
            ({ name, code, sprice, pprice, dprice, discount, qty, sizes, images })
        )(item.company.variantinput || {}),
        );


        if (Capacitor.isNativePlatform()) {
            SplashScreen.show({ autoHide: false });
        }

        setTimeout(() => window.location.reload(), 50);
        }
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
        mode="click"
        :items="[teams(companies)]"
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
            <UAvatar :src="`https://images.markit.co.in/${activeCompany[0]?.company?.logo}`" size="sm" />

            <span
                class="truncate text-gray-900 dark:text-white font-semibold"
                >{{ activeCompany[0]?.company?.name }}</span
            >
        </UButton>
    </UDropdown>

</template>
