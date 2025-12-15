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
        logo: user.companies[0].company.logo ?? undefined,
        description: user.companies[0].company.description ?? undefined,
        thankYouNote: user.companies[0].company.thankYouNote ?? undefined,
        refundPolicy: user.companies[0].company.refundPolicy ?? undefined,
        returnPolicy: user.companies[0].company.returnPolicy ?? undefined,
        companyPhone: user.companies[0].company.phone ?? undefined,
        commissionRate: user.companies[0].company.commissionRate ?? undefined,
        image: user.image || null,
        email: user.email,
        printerLabelSize: user.companies[0].company.printerLabelSize ?? undefined,
        code: user.companies[0].code ?? undefined,
        storeUniqueName: user.companies[0].company.storeUniqueName ?? undefined,
        isTaxIncluded: user.companies[0].company.isTaxIncluded,
        isAiImage: user.companies[0].company.isAiImage || true,
        deliveryType: user.companies[0].company.deliveryType || [],
        deliveryMode: user.companies[0].company.deliveryMode || [],
        fundDeliveryFees: user.companies[0].company.fundDeliveryFees || false,
        deliveryRadius: user.companies[0].company.deliveryRadius || 0,
        deliveryFeesPerKm: user.companies[0].company.deliveryFeesPerKm || 0,
        waitingTime: user.companies[0].company.waitingTime || 0,
        waitingChargesPerMin: user.companies[0].company.waitingChargesPerMin || 0,
        minDeliveryCharges: user.companies[0].company.minDeliveryCharges || 0,
        deliveryDiscountThreshold: user.companies[0].company.deliveryDiscountThreshold || 0,
        deliveryDiscountAmount: user.companies[0].company.deliveryDiscountAmount || 0,
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
        openTime: user.companies[0].company.openTime || '',
        closeTime: user.companies[0].company.closeTime || '',
        gstin: user.companies[0].company.gstin || '',
        accHolderName: user.companies[0].company.accHolderName || '',
        ifsc: user.companies[0].company.ifsc || '',
        accountNo: user.companies[0].company.accountNo || '',
        bankName: user.companies[0].company.bankName || '',
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
