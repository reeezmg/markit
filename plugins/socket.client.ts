import { io } from "socket.io-client"


export default defineNuxtPlugin((nuxtApp) => {
  const config = useRuntimeConfig();
const serverUrl = config.public.serverUrl
  const socket = io(serverUrl, {
    withCredentials: true,
  })

  const useAuth = () => useNuxtApp().$auth;
  const joinCurrentCompany = () => {
    const companyId = useAuth()?.session?.value?.companyId
    if (companyId) {
      socket.emit("joinCompany", companyId)
    }
  }

  watch(
    () => useAuth()?.session?.value?.companyId,
    (val) => {
      if (val) {
        socket.emit("joinCompany", val)
      }
    },
    { immediate: true }
  )

  socket.on("connect", joinCurrentCompany)

  nuxtApp.provide("socket", socket)
})
