export default eventHandler(async (event) => {
    const session = await useAuthSession(event);
    const { isCostIncluded } = await readBody(event);
    await session.update({
        isCostIncluded
    });
    return session;
});
