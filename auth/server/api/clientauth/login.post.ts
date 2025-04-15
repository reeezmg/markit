import { useAuthClientSession } from '../../utils/clientSession';
import { findClientByPhone } from '../../utils/clientdb';

export default eventHandler(async (event) => {
    const session = await useAuthClientSession(event);
    const { phone } = await readBody(event);
    const client = await findClientByPhone(phone);

    if (!client) {
        throw createError({
            message: 'Email not found! Please register.',
            statusCode: 401,
        });
    }
    
  
    await session.update({
        id: client.id,
        name: client.name,
        email: client.email,
        phone: client.phone,
        type:'CLIENT'
    });
    return session;
});
