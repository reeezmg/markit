export default eventHandler(async (event) => {
    const session = await useAuthSession(event);
    const { companyId, companyType, companyName, name, role, code, billCounter,plan, description, storeUniqueName } = await readBody(event);
    console.log(plan)
    await session.update({
        name,
        role,
        code,
        billCounter,
        companyId,
        companyType,
        companyName,
        plan,
        description,
        storeUniqueName,
    });
    console.log('session updated', session.data);
    return session;
});
