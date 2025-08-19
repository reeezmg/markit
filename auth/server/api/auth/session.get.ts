export default eventHandler(async (event) => {
  // 🚫 Disable caching for this route
  setHeader(event, 'Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  setHeader(event, 'Pragma', 'no-cache');
  setHeader(event, 'Expires', '0');

  const session = await useAuthSession(event);
  return session.data;
});
