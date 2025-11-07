export default eventHandler(async (event) => {
    const session = await useAuthSession(event);
    const { isAiImage } = await readBody(event);
    await session.update({
        isAiImage
    });
    return session;
});
