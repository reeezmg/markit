export default eventHandler(async (event) => {
    const session = await useAuthSession(event);
    const body = await readBody(event);
    const {
        billPrefix, quotePrefix, salesOrderPrefix, invoicePrefix, paymentPrefix,
        expensePrefix, distributorPrefix, distributorPaymentPrefix, distributorCreditPrefix,
        clientPrefix, userPrefix, accountPrefix,
    } = body;
    await session.update({
        billPrefix, quotePrefix, salesOrderPrefix, invoicePrefix, paymentPrefix,
        expensePrefix, distributorPrefix, distributorPaymentPrefix, distributorCreditPrefix,
        clientPrefix, userPrefix, accountPrefix,
    });
    return session;
});
