export default eventHandler(async (event) => {
    const session = await useAuthSession(event);
    const { logo } = await readBody(event);
    await session.update({
        logo,
    });
    return session;
});
    