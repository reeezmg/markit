export default eventHandler(async (event) => {
    const session = await useAuthSession(event);
    const { companyPhone } = await readBody(event);
    await session.update({
        companyPhone
    });
    return session;
});
