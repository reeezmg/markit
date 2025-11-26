export default eventHandler(async (event) => {
    const session = await useAuthSession(event);
    const { addstate} = await readBody(event);
    await session.update({
        address:addstate
    });
    return session;
});
