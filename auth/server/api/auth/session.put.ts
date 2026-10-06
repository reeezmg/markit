export default eventHandler(async (event) => {
  const session = await useAuthSession(event);
  const body = await readBody(event);
  if (!session.data.id || !session.data.email) throw createError({ statusCode: 401, statusMessage: 'Not authorized' });
  if (body?.companyId !== undefined && body.companyId !== session.data.companyId) {
    throw createError({ statusCode: 403, statusMessage: 'Use the company switch endpoint' });
  }
  if (body?.allStores !== undefined || body?.delegatedHeadOfficeId !== undefined ||
      body?.organizationHeadOfficeId !== undefined || body?.readCompanyId !== undefined) {
    throw createError({ statusCode: 403, statusMessage: 'Use the organization access endpoint' });
  }

  // Only merge fields that were explicitly provided — undefined values must not
  // overwrite existing session fields (e.g. id, cleanup, cleanupCode preserved on company switch).
  const updates = Object.fromEntries(
    Object.entries(body).filter(([_, v]) => v !== undefined)
  );

  await session.update({ ...session.data, ...updates });
console.log("session",session.data)
  return session;
});
