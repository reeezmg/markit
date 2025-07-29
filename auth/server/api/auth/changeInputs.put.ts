export default eventHandler(async (event) => {
    const session = await useAuthSession(event);
    const { productinputData, variantinputData } = await readBody(event);
    await session.update({
        productInputs:productinputData,
        variantInputs:variantinputData
    });
    return session;
});
    