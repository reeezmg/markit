export default eventHandler(async (event) => {
    const session = await useAuthSession(event);
    const { companyId, companyType, companyName,companyLogo, name, role, code, billCounter,plan, description, storeUniqueName } = await readBody(event);
    console.log("companylogo",companyLogo)
    await session.update({
        name,
        role,
        code,
        billCounter,
        companyId,
        companyType,
        companyName,
        logo:companyLogo,
        plan,
        description,
        storeUniqueName,
    });
    console.log('session updated', session.data);
    return session;
});
