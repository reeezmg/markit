export default defineNuxtRouteMiddleware((to) => {
  // Apply only to /cleanup (or dynamic paths like /cleanup/xyz if needed)
  if (!to.path.startsWith('/cleanup')) return

  const nuxtApp = useNuxtApp()
  const session = nuxtApp.$auth.session.value
console.log('Session:', session)
  const cleanup = session?.cleanup ?? false

  if (!cleanup) {
    return showError({
      statusCode: 404,
      statusMessage: 'Page not found',
    })
  }
})
