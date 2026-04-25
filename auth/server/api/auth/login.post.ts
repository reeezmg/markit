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
    const purchaseExpenseCategoryId = await getPurchaseExpenseCategoryId(user.companies[0].companyId);

    await session.update({
        id: user.id,
        cleanup: user.cleanup || false,
        cleanupCode: user.cleanupCode ?? undefined,
        name: user.companies[0].name || null,
        purchaseExpenseCategoryId,
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
        deliveryRadius: user.companies[0].company.deliveryRadius || 0,
        deliveryDiscount: user.companies[0].company.deliveryDiscount || 100,
        isCostIncluded: user.companies[0].company.isCostIncluded,
        isUserTrackIncluded: user.companies[0].company.isUserTrackIncluded,
        companyId: user.companies[0].companyId,
        companyType: user.companies[0].company.type,
        companyName: user.companies[0].company.name,
        pipelineId: user.companies[0].company.pipeline?.id,
        role: user.companies[0].role,
        pointsValue: user.companies[0].company.pointsValue || 0,
        currency: user.companies[0].company.currency || 'INR',
        type:user.companies[0].role,
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

        closingDate: user.companies[0].company.closingDate ?? null,
        billPrefix: user.companies[0].company.billPrefix ?? '',
        quotePrefix: user.companies[0].company.quotePrefix ?? 'QT',
        salesOrderPrefix: user.companies[0].company.salesOrderPrefix ?? 'SO',
        invoicePrefix: user.companies[0].company.invoicePrefix ?? 'INV',
        paymentPrefix: user.companies[0].company.paymentPrefix ?? '',
        expensePrefix: user.companies[0].company.expensePrefix ?? 'EXP',
        distributorPrefix: user.companies[0].company.distributorPrefix ?? 'DIST',
        distributorPaymentPrefix: user.companies[0].company.distributorPaymentPrefix ?? 'DP',
        distributorCreditPrefix: user.companies[0].company.distributorCreditPrefix ?? 'DC',
        clientPrefix: user.companies[0].company.clientPrefix ?? 'CL',
        userPrefix: user.companies[0].company.userPrefix ?? '',
        accountPrefix: user.companies[0].company.accountPrefix ?? 'ACC',
        authSessionVersion:process.env.AUTH_SESSION_VERSION
    });

    return session;
});
