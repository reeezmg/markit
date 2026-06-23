export default eventHandler(async (event) => {
    const session = await useAuthSession(event);
    const { accHolderName, ifsc, accountNo, bankName, gstin, upiId } = await readBody(event);
    await session.update({
        accHolderName,
        ifsc,
        accountNo,
        bankName,
        gstin,
        upiId,
    });
    return session;
});
