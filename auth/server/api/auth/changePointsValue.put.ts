export default eventHandler(async (event) => {
    const session = await useAuthSession(event);
    const { pointsValue } = await readBody(event);
    await session.update({
        pointsValue
    });
    return session;
});
