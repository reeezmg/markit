export default eventHandler(async (event) => {
    const session = await useAuthSession(event);
    const { companyId, companyType, companyName } = await readBody(event);
    await session.update({
        id: session.data.id,
        name: session.data.name,
        email: session.data.email,
        role: session.data.role,
        companyId,
        companyType,
        companyName,
    });
    return session;
});
