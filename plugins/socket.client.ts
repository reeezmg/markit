import { io } from "socket.io-client"


export default defineNuxtPlugin((nuxtApp) => {
  const config = useRuntimeConfig();
const serverUrl = config.public.serverUrl
  const socket = io(serverUrl, {
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
