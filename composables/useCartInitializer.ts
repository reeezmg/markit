// ~/composables/useCartInitializer.ts
import { watch, unref, type MaybeRef } from 'vue';
import { useCartStore } from '~/stores/cartStore';
import { useClientAuth } from '#imports';
import { useDebounceFn } from '@vueuse/core';

export const useCartInitializer = (companyName: MaybeRef<string>) => {
  const cartStore = useCartStore();
  const auth = useClientAuth();

  // Using VueUse's debounce instead of lodash
  const debouncedInitialize = useDebounceFn(async (company: string) => {
    if (company) {
      await cartStore.initializeCart(company);
      
      // Merge carts if user just logged in
      if (auth.session.value?.id && cartStore.items.length > 0) {
        await cartStore.mergeWithServerCart();
      }
    }
  }, 300);

  // Watch for company changes
  watch(
    () => unref(companyName),
    (newCompany) => debouncedInitialize(newCompany),
    { immediate: true }
  );

  // Watch for auth changes
  watch(
    () => auth.session.value?.id,
    async () => {
      const company = unref(companyName);
      if (company) {
        await cartStore.initializeCart(company);
      }
    },
    { immediate: true }
  );
};