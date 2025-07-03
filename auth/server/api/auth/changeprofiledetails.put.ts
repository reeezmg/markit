export default eventHandler(async (event) => {
    const session = await useAuthSession(event);
    const { name, email, image } = await readBody(event);
    await session.update({
        name: name || session.data.name,
        email:email || session.data.email,
        image: image || session.data.image,
    });
    return session;
});
