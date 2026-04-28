export default defineNuxtRouteMiddleware(() => {
  const auth = useNuxtApp().$auth

  if (auth.session.value?.type !== 'admin') {
    return navigateTo('/reports/sales')
  }
})
