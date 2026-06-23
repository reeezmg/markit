export default eventHandler(async (event) => {
    const session = await useAuthSession(event);
    const body = await readBody(event);
    const {
        billPrefix,
        expensePrefix, distributorPrefix, distributorPaymentPrefix, distributorCreditPrefix,
        clientPrefix, userPrefix, accountPrefix,
    } = body;
    await session.update({
        billPrefix,
        expensePrefix, distributorPrefix, distributorPaymentPrefix, distributorCreditPrefix,
        clientPrefix, userPrefix, accountPrefix,
    });
    return session;
});
