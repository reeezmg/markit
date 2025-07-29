export default eventHandler(async (event) => {
    const session = await useAuthSession(event);
    const { isBarcodeIncluded } = await readBody(event);
    await session.update({
        isBarcodeIncluded
    });
    return session;
});
