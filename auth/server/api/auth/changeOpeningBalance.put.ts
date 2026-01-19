export default eventHandler(async (event) => {
    const session = await useAuthSession(event);
    const { openingBalance } = await readBody(event);
    await session.update({
        cash: openingBalance.cash,
        bank: openingBalance.bank,
    });
    return session;
});
