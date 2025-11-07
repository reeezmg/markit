export default eventHandler(async (event) => {
    const session = await useAuthSession(event);
    const { deliveryMode, fundDeliveryFees, deliveryRadius, deliveryFeesPerKm, waitingTime, waitingChargesPerMin, minDeliveryCharges, deliveryDiscountThreshold, deliveryDiscountAmount } = await readBody(event);
    console.log(deliveryMode);
    await session.update({
        deliveryMode: deliveryMode,
        fundDeliveryFees: fundDeliveryFees,
        deliveryRadius: deliveryRadius,
        deliveryFeesPerKm: deliveryFeesPerKm,
        waitingTime: waitingTime,
        waitingChargesPerMin: waitingChargesPerMin,
        minDeliveryCharges: minDeliveryCharges,
        deliveryDiscountThreshold: deliveryDiscountThreshold,
        deliveryDiscountAmount: deliveryDiscountAmount,
    });
    return session;
});
