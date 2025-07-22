export default defineEventHandler(async (event) => {
  const session = await useAuthSession(event); // or however you access it

  if (session?.data.id) {
    const currentVersion = process.env.AUTH_SESSION_VERSION; // from Redis, DB, or ENV
    if (session.data.authSessionVersion !== currentVersion) {
      deleteCookie(event, 'nuxt-session');
      return sendRedirect(event, '/login');
    }
  }
});
