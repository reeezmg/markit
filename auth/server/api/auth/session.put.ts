export default eventHandler(async (event) => {
    const session = await useAuthSession(event);
    const { companyId, companyType, companyName, name, role, code, billCounter } = await readBody(event);
    await session.update({
        name,
        role,
        code,
        billCounter,
        companyId,
        companyType,
        companyName,
    });
    return session;
});
