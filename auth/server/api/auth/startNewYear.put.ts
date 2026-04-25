export default eventHandler(async (event) => {
    const session = await useAuthSession(event);
    const { closingDate } = await readBody(event);
    await session.update({
        closingDate
    });
    return session;
});
