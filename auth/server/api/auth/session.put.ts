export default eventHandler(async (event) => {
    const session = await useAuthSession(event);
    const { companyId, companyType, companyName, name, role } = await readBody(event);
    await session.update({
        name,
        role,
        companyId,
        companyType,
        companyName,
    });
    return session;
});
