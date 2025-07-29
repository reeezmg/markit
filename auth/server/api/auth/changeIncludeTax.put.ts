export default eventHandler(async (event) => {
    const session = await useAuthSession(event);
    const { isTaxIncluded } = await readBody(event);
    await session.update({
        isTaxIncluded
    });
    return session;
});
