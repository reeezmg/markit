export default defineNuxtPlugin(async (nuxtApp) => {
  const cartStore = useCartStore();
  
  // Only hydrate on client-side
  if (process.client) {
    try {
      await cartStore.hydrate();
      console.debug('Cart hydrated:', cartStore.isHydrated);
      
    } catch (error) {
      console.error('Cart hydration failed:', error);
    }
  }
});