import { findUserById,updatePassword } from '../../utils/db';

export default eventHandler(async (event) => {
    const session = await requireAuthSession(event);
    const { current_password,  password } = await readBody(event);
    const id = session.data.id;

    if (!id) {
        throw createError({
            message: 'Not Authorized',
            statusCode: 401,
        });
    }

    if (!current_password || !password) {
        throw createError({
            message: 'Current password and new password are required.',
            statusCode: 400,
        });
    }

    if (password.length < 6) {
        throw createError({
            message: 'Password must be at least 6 characters.',
            statusCode: 400,
        });
    }

    const user = await findUserById(id);
    if (!user) {
        throw createError({
            message: 'User Not found.',
            statusCode: 404,
        });
    }

    if (!user.password || user.password !== (await hash(current_password))) {
        throw createError({
            message: 'Incorrect password!',
            statusCode: 401,
        });
    }
  
    await updatePassword(id, await hash(password));
    
    return {
        message: 'Password updated successfully',
    };
});
