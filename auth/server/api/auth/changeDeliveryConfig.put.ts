export default eventHandler(async (event) => {
    const session = await useAuthSession(event);
    const { deliveryMode, deliveryRadius, deliveryDiscount } = await readBody(event);
    await session.update({
        deliveryMode: deliveryMode,
        deliveryRadius: deliveryRadius,
        deliveryDiscount: Math.max(50, Number(deliveryDiscount) || 100),
    });
    return session;
});
