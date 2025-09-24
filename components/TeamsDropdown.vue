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
                company: {
                    include:{
                        productinput:true,
                        variantinput:true
                    }
                },
            },
        },
    },
});



const isOpen = ref(false);
const companies = ref([]);
const activeCompany = ref({});

watch(user, (newUser) => {
  if (newUser) {
    companies.value = newUser.companies.map((item) => item);
    activeCompany.value = newUser.companies.find(
      (item) => item.company.id === useAuth().session.value?.companyId
    )?.company;
  }
}, { immediate: true });

const teams = (items) =>
    items.map((item) => ({
        label: item.company.name,
        avatar: {
            src:`https://images.markit.co.in/${item.company.logo}` ,
            alt: item.company.name
        },
       click: async () => {
        activeCompany.value =  item.company
       await updateCompanySession(
        item.userId,
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
        item.company.isUserTrackIncluded,
        item.company.id,
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
            <UAvatar 
                :src="activeCompany?.logo ? `https://images.markit.co.in/${activeCompany.logo}` : undefined"
                :alt="activeCompany?.name"
                size="sm" 
            />

            <span
                class="truncate text-gray-900 dark:text-white font-semibold"
                >{{ activeCompany?.name }}</span
            >
        </UButton>
    </UDropdown>

</template>
