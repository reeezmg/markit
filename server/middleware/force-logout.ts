export default defineEventHandler(async (event) => {
  const url = getRequestURL(event)

  // ❌ Add route paths t
  // hat should be excluded here
  const excludedPaths = [
    '/api/clientauth/login',
    '/api/clientauth/logout',
    '/api/clientauth/session'
  ];

  if (excludedPaths.includes(url.pathname)) {
    return; // Skip middleware logic
  }

  const session = await useAuthSession(event);

  if (session?.data.id) {
    const currentVersion = process.env.AUTH_SESSION_VERSION;
    if (session.data.authSessionVersion !== currentVersion) {
      deleteCookie(event, 'nuxt-session');
      return sendRedirect(event, '/login');
    }
  }
});
