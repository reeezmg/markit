export default eventHandler(async (event) => {
    const session = await useAuthSession(event);
    const { category} = await readBody(event);
    console.log("category",category)
    await session.update({
        category
    });
    return session;
});