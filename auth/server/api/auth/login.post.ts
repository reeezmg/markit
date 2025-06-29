export default eventHandler(async (event) => {
    const session = await useAuthSession(event);
    const { email, password } = await readBody(event);
    const user = await findUserByEmail(email);

    if (!user) {
        throw createError({
            message: 'Email not found! Please register.',
            statusCode: 401,
        });
    }

    if (!user.password || user.password !== (await hash(password))) {
        throw createError({
            message: 'Incorrect password!',
            statusCode: 401,
        });
    }

    await session.update({
        id: user.id,
        name: user.companies[0].name || null,
        image: user.image || null,
        email: user.email,
        storeUniqueName: user.companies[0].company.storeUniqueName,
        isTaxIncluded: user.companies[0].company.isTaxIncluded,
        isBarcodeIncluded: user.companies[0].company.isBarcodeIncluded,
        isUserTrackIncluded: user.companies[0].company.isUserTrackIncluded,
        companyId: user.companies[0].companyId,
        companyType: user.companies[0].company.type,
        companyName: user.companies[0].company.name,
        pipelineId: user.companies[0].company.pipeline?.id,
        role: user.role,
        shopifyStoreName:user.companies[0].company.shopifyStoreName,
        shopifyAccessToken:user.companies[0].company.shopifyAccessToken,
        type:'USER',
        address: user.companies[0].company.address || {},
        gstin: user.companies[0].company.gstin || '',
        accHolderName: user.companies[0].company.accHolderName || '',
        upiId: user.companies[0].company.upiId || '',
        productInputs: (({ name, brand, category, subcategory, description }) =>
        ({ name, brand, category, subcategory, description }))(user.companies[0].company.productinput || {}),

        variantInputs: (({ name, code, sprice, pprice, dprice, discount, qty, sizes, images }) =>
        ({ name, code, sprice, pprice, dprice, discount, qty, sizes, images }))(user.companies[0].company.variantinput || {}),
    });

    return session;
});
