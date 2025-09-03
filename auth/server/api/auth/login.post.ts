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
        cleanup: user.cleanup || false,
        name: user.companies[0].name || null,
        description: user.companies[0].company.description ?? undefined,
        thankYouNote: user.companies[0].company.thankYouNote ?? undefined,
        refundPolicy: user.companies[0].company.refundPolicy ?? undefined,
        returnPolicy: user.companies[0].company.returnPolicy ?? undefined,
        companyPhone: user.companies[0].company.phone ?? undefined,
        image: user.image || null,
        email: user.email,
        code: user.companies[0].code ?? undefined,
        storeUniqueName: user.companies[0].company.storeUniqueName ?? undefined,
        isTaxIncluded: user.companies[0].company.isTaxIncluded,
        isBarcodeIncluded: user.companies[0].company.isBarcodeIncluded,
        isUserTrackIncluded: user.companies[0].company.isUserTrackIncluded,
        companyId: user.companies[0].companyId,
        companyType: user.companies[0].company.type,
        companyName: user.companies[0].company.name,
        pipelineId: user.companies[0].company.pipeline?.id,
        role: user.companies[0].role,
        pointsValue: user.companies[0].company.pointsValue || 0,
        currency: user.companies[0].company.currency || 'INR',
        type:'USER',
        address: user.companies[0].company.address || {},
        gstin: user.companies[0].company.gstin || '',
        accHolderName: user.companies[0].company.accHolderName || '',
        upiId: user.companies[0].company.upiId || '',
        plan: user.companies[0].company.plan,
        productInputs: (({ name, brand, category, subcategory, description }) =>
        ({ name, brand, category, subcategory, description }))(user.companies[0].company.productinput || {}),

        variantInputs: (({ name, code, sprice, pprice, dprice, discount, qty, sizes, images, button }) =>
        ({ name, code, sprice, pprice, dprice, discount, qty, sizes, images, button }))(user.companies[0].company.variantinput || {}),

        authSessionVersion:process.env.AUTH_SESSION_VERSION
    });

    return session;
});
