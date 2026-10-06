import { normalizeBillingUnits } from '~/utils/billing-units';
import { normalizeSizeLabels } from '~/utils/size-labels';
import { ensureHeadOfficeBranchMemberships, getHeadOfficeAdmin } from '~/server/utils/organizationAccess';

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
    const selectedCompanyUser = user.companies.find((item) =>
        item.status && !item.deleted && item.company.status && !item.delegatedHeadOfficeId
    ) ?? user.companies.find((item) => item.status && !item.deleted && item.company.status);
    if (!selectedCompanyUser || (selectedCompanyUser.delegatedHeadOfficeId &&
        (selectedCompanyUser.company.parentCompanyId !== selectedCompanyUser.delegatedHeadOfficeId ||
         !await getHeadOfficeAdmin(user.id, selectedCompanyUser.delegatedHeadOfficeId)))) {
        throw createError({ statusCode: 403, statusMessage: 'No active company access' });
    }
    const purchaseExpenseCategoryId = await getPurchaseExpenseCategoryId(selectedCompanyUser.companyId);

    if (selectedCompanyUser.role === 'admin' && selectedCompanyUser.company.isHeadOffice &&
        !selectedCompanyUser.company.parentCompanyId) {
        await ensureHeadOfficeBranchMemberships(user.id, selectedCompanyUser.companyId, selectedCompanyUser.name);
    }

    await session.update({
        id: user.id,
        allStores: selectedCompanyUser.role === 'admin' && selectedCompanyUser.company.isHeadOffice && !selectedCompanyUser.company.parentCompanyId,
        organizationHeadOfficeId: undefined,
        readCompanyId: undefined,
        delegatedHeadOfficeId: selectedCompanyUser.delegatedHeadOfficeId ?? undefined,
        cleanup: user.cleanup || false,
        cleanupCode: user.cleanupCode ?? undefined,
        name: selectedCompanyUser.name || null,
        purchaseExpenseCategoryId,
        logo: selectedCompanyUser.company.logo ?? undefined,
        description: selectedCompanyUser.company.description ?? undefined,
        thankYouNote: selectedCompanyUser.company.thankYouNote ?? undefined,
        refundPolicy: selectedCompanyUser.company.refundPolicy ?? undefined,
        returnPolicy: selectedCompanyUser.company.returnPolicy ?? undefined,
        companyPhone: selectedCompanyUser.company.phone ?? undefined,
        commissionRate: selectedCompanyUser.company.commissionRate ?? undefined,
        image: user.image || null,
        email: user.email,
        printerLabelSize: selectedCompanyUser.company.printerLabelSize ?? undefined,
        code: selectedCompanyUser.code ?? undefined,
        storeUniqueName: selectedCompanyUser.company.storeUniqueName ?? undefined,
        isTaxIncluded: selectedCompanyUser.company.isTaxIncluded,
        isAiImage: selectedCompanyUser.company.isAiImage ?? true,
        deliveryType: selectedCompanyUser.company.deliveryType || [],
        deliveryMode: selectedCompanyUser.company.deliveryMode || [],
        deliveryRadius: selectedCompanyUser.company.deliveryRadius || 0,
        deliveryDiscount: selectedCompanyUser.company.deliveryDiscount ?? 0,
        codCharge: selectedCompanyUser.company.codCharge ?? 0,
        isCostIncluded: selectedCompanyUser.company.isCostIncluded,
        isUserTrackIncluded: selectedCompanyUser.company.isUserTrackIncluded,
        companyId: selectedCompanyUser.companyId,
        companyType: selectedCompanyUser.company.type,
        companyName: selectedCompanyUser.company.name,
        pipelineId: selectedCompanyUser.company.pipeline?.id,
        role: selectedCompanyUser.role,
        pointsValue: selectedCompanyUser.company.pointsValue || 0,
        currency: selectedCompanyUser.company.currency || 'INR',
        type:selectedCompanyUser.role,
        address: selectedCompanyUser.company.address || {},
        openTime: selectedCompanyUser.company.openTime || '',
        closeTime: selectedCompanyUser.company.closeTime || '',
        gstin: selectedCompanyUser.company.gstin || '',
        accHolderName: selectedCompanyUser.company.accHolderName || '',
        ifsc: selectedCompanyUser.company.ifsc || '',
        accountNo: selectedCompanyUser.company.accountNo || '',
        bankName: selectedCompanyUser.company.bankName || '',
        upiId: selectedCompanyUser.company.upiId || '',
        openingCashDate: selectedCompanyUser.company.openingCashDate ? selectedCompanyUser.company.openingCashDate.toISOString() : null,
        openingBankDate: selectedCompanyUser.company.openingBankDate ? selectedCompanyUser.company.openingBankDate.toISOString() : null,
        plan: selectedCompanyUser.company.plan,
        productInputs: (({ name, brand, category, subcategory, description }) =>
        ({ name, brand, category, subcategory, description }))(selectedCompanyUser.company.productinput || {}),

        variantInputs: (({ name, code, sprice, pprice, dprice, discount, qty, unit, sizes, sizeLabels, images, button }) => ({
        name,
        code,
        sprice,
        pprice,
        dprice,
        discount,
        qty,
        unit: normalizeBillingUnits(unit),
        sizes,
        sizeLabels: normalizeSizeLabels(sizeLabels),
        images,
        button,
        }))(selectedCompanyUser.company.variantinput || {}),

        closingDate: selectedCompanyUser.company.closingDate ?? null,
        billPrefix: selectedCompanyUser.company.billPrefix ?? '',
        expensePrefix: selectedCompanyUser.company.expensePrefix ?? 'EXP',
        distributorPrefix: selectedCompanyUser.company.distributorPrefix ?? 'DIST',
        distributorPaymentPrefix: selectedCompanyUser.company.distributorPaymentPrefix ?? 'DP',
        distributorCreditPrefix: selectedCompanyUser.company.distributorCreditPrefix ?? 'DC',
        clientPrefix: selectedCompanyUser.company.clientPrefix ?? 'CL',
        userPrefix: selectedCompanyUser.company.userPrefix ?? '',
        accountPrefix: selectedCompanyUser.company.accountPrefix ?? 'ACC',
        authSessionVersion:process.env.AUTH_SESSION_VERSION
    });

    return session;
});
