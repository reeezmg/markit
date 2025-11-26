export default eventHandler(async (event) => {
    const session = await useAuthSession(event);
    const { description, thankYouNote, refundPolicy, returnPolicy} = await readBody(event);
    await session.update({
        description,
        thankYouNote,
        refundPolicy,
        returnPolicy
    });
    return session;
});
