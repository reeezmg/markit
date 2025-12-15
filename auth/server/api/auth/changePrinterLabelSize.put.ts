export default eventHandler(async (event) => {
    const session = await useAuthSession(event);
    const { printerLabelSize } = await readBody(event);
    await session.update({
        printerLabelSize,
    });
    return session;
});
    