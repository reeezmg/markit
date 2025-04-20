import { findUserById,updatePassword } from '../../utils/db';

export default eventHandler(async (event) => {
    const { current_password,  password, id } = await readBody(event);

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
