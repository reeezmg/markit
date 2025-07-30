export default eventHandler(async (event) => {
    const session = await useAuthSession(event);
    const { companyId, companyType, companyName, name, role, code, billCounter,plan } = await readBody(event);
    console.log(plan)
    await session.update({
        name,
        role,
        code,
        billCounter,
        companyId,
        companyType,
        companyName,
        plan
    });
    return session;
});
