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
       await updateCompanySession({
          id: item.userId,
          cleanup: item.cleanup || false,
          cleanupCode: item.cleanupCode ?? undefined,
          name: item.name || null,
          logo: item.company.logo ?? undefined,
          description: item.company.description ?? undefined,
          thankYouNote: item.company.thankYouNote ?? undefined,
          refundPolicy: item.company.refundPolicy ?? undefined,
          returnPolicy: item.company.returnPolicy ?? undefined,
          companyPhone: item.company.phone ?? undefined,
          commissionRate: item.company.commissionRate ?? undefined,
          image: item.image || null,
          printerLabelSize: item.company.printerLabelSize ?? undefined,
          code: item.code ?? undefined,
          storeUniqueName: item.company.storeUniqueName ?? undefined,
          isTaxIncluded: item.company.isTaxIncluded,
          isAiImage: item.company.isAiImage || true,
          deliveryType: item.company.deliveryType || [],
          deliveryMode: item.company.deliveryMode || [],
          fundDeliveryFees: item.company.fundDeliveryFees || false,
          deliveryRadius: item.company.deliveryRadius || 0,
          deliveryFeesPerKm: item.company.deliveryFeesPerKm || 0,
          waitingTime: item.company.waitingTime || 0,
          waitingChargesPerMin: item.company.waitingChargesPerMin || 0,
          minDeliveryCharges: item.company.minDeliveryCharges || 0,
          deliveryDiscountThreshold: item.company.deliveryDiscountThreshold || 0,
          deliveryDiscountAmount: item.company.deliveryDiscountAmount || 0,
          isCostIncluded: item.company.isCostIncluded,
          isUserTrackIncluded: item.company.isUserTrackIncluded,
          companyId: item.companyId,
          companyType: item.company.type,
          companyName: item.company.name,
          pipelineId: item.company.pipeline?.id,
          role: item.role,
          pointsValue: item.company.pointsValue || 0,
          currency: item.company.currency || 'INR',
          type: item.role,
          address: item.company.address || {},
          openTime: item.company.openTime || '',
          closeTime: item.company.closeTime || '',
          gstin: item.company.gstin || '',
          accHolderName: item.company.accHolderName || '',
          ifsc: item.company.ifsc || '',
          accountNo: item.company.accountNo || '',
          bankName: item.company.bankName || '',
          upiId: item.company.upiId || '',
          plan: item.company.plan,
          productInputs: (({ name, brand, category, subcategory, description }) =>
            ({ name, brand, category, subcategory, description })
          )(item.company.productinput || {}),
          variantInputs: (({ name, code, sprice, pprice, dprice, discount, qty, sizes, images, button }) =>
            ({ name, code, sprice, pprice, dprice, discount, qty, sizes, images, button })
          )(item.company.variantinput || {}),
        });

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
