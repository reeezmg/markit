export default eventHandler(async (event) => {
    const session = await useAuthSession(event);
    const { isUserTrackIncluded } = await readBody(event);
    await session.update({
        isUserTrackIncluded
    });
    return session;
});
