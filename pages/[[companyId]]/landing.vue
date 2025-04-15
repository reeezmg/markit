<script setup lang="ts">
import { useFindUniqueCompany } from '~/lib/hooks';

const cartStore = useCartStore();
const cartItemCount = computed(() => cartStore.cartItemCount);
const useAuth = () => useNuxtApp().$auth;
const auth = useAuth();
const route = useRoute();
const queryParam = route.params;

const {
    data: companyName,
} = useFindUniqueCompany({
  where:{
    id: queryParam.Id
  },
  select:{
    name:true
  }
});



</script>

<template>
    <UDashboardPage>
        <UDashboardPanel grow>
            <UDashboardNavbar :title=companyName?.name>
                <template #right>
                    <UTooltip text="Notifications" :shortcuts="['N']">
                        <NuxtLink
                            :to="`/${auth.session.value?.companyId}/checkout`"
                        >
                            <UChip :text="cartItemCount" color="red" size="2xl">
                                <UIcon
                                    name="i-heroicons-shopping-cart"
                                    class="w-5 h-5"
                                />
                            </UChip>
                        </NuxtLink>
                    </UTooltip>
                </template>
            </UDashboardNavbar>
            <NuxtPage />
        </UDashboardPanel>
    </UDashboardPage>
</template>
