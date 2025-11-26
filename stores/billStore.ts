export const useBillStore = defineStore('bill', {
  state: () => ({ lastUpdate: Date.now() }),
  actions: {
    notifyUpdate() {
      this.lastUpdate = Date.now()
    },
  },
})
