export default eventHandler(async (event) => {
    const session = await useAuthSession(event);
    const { deliveryMode, deliveryRadius, deliveryDiscount, codCharge } = await readBody(event);
    await session.update({
        deliveryMode: deliveryMode,
        deliveryRadius: deliveryRadius,
        deliveryDiscount: Math.min(100, Math.max(0, Number(deliveryDiscount) || 0)),
        codCharge: Math.max(0, Number(codCharge) || 0),
    });
    return session;
});
