export default eventHandler(async (event) => {
    const session = await useAuthSession(event);
    const { storeUniqueName } = await readBody(event);
    await session.update({
        storeUniqueName
    });
    return session;
});
