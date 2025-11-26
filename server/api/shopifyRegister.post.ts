import { updateCompany } from "../utils/db";

export default eventHandler(async (event) => {
    const { email, password } = await readBody(event);
    console.log(email, password)
    const user = await shopifyLogin(email);

    if (!user) {
        throw createError({
            message: 'Email not found! Please register.',
            statusCode: 401,
        });
    }

    if (!user.password || user.password !== (await hash(password))) {
        throw createError({
            message: 'Incorrect password!',
            statusCode: 401,
        });
    }
    
    return {companies: user.companies}
});
