export default eventHandler(async (event) => {
    const session = await useAuthSession(event);
    const { openTime, closeTime} = await readBody(event);
    console.log(openTime,closeTime)
    await session.update({
        openTime,
        closeTime,
    });
    return session;
});
