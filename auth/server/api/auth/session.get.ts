export default eventHandler(async (event) => {
  // 🚫 Disable caching for this route

  const session = await useAuthSession(event);
  return session.data;
});
