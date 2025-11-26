export default eventHandler(async (event) => {
    const session = await useAuthSession(event);
    const { deliveryType } = await readBody(event);
    await session.update({
        deliveryType,
    });
    return session;
});
    