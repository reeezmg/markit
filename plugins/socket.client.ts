import { io } from "socket.io-client"

export default defineNuxtPlugin((nuxtApp) => {
  const socket = io("http://localhost:3005", {
    withCredentials: true,
  })

const useAuth = () => useNuxtApp().$auth;
const companyId = ref(useAuth().session.value?.companyId)
  watch(companyId, (val) => {
    if (val) {
        console.log(val)
      socket.emit("joinCompany", val)
    }
  }, { immediate: true })

  nuxtApp.provide("socket", socket)
})
