import { useAuthClientSession } from '../../utils/clientSession';

export default eventHandler(async (event) => {
    const session = await useAuthClientSession(event);
    await session.clear();
    return {
        message: 'Successfully logged out!',
    };
});
