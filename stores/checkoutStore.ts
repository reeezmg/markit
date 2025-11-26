export const useCheckoutStore = defineStore('checkout', {
  state: () => ({ lastUpdate: Date.now() }),
  actions: {
    notifyUpdate() {
      this.lastUpdate = Date.now()
    },
  },
})
