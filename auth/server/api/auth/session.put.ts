export default eventHandler(async (event) => {
  const session = await useAuthSession(event);
  const body = await readBody(event);

  // Only merge fields that were explicitly provided — undefined values must not
  // overwrite existing session fields (e.g. id, cleanup, cleanupCode preserved on company switch).
  const updates = Object.fromEntries(
    Object.entries(body).filter(([_, v]) => v !== undefined)
  );

  await session.update({ ...session.data, ...updates });
console.log("session",session.data)
  return session;
});
